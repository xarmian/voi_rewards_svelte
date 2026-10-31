import { test, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert/strict';
import { fetchFungibleTokens } from './fungibleTokens.ts';
import { algodClient } from '../utils/algod.ts';
import { getLiquidityPools, type PoolInfo } from './lp.ts';
import algosdk from 'algosdk';
import { clearCaches } from '$lib/stores/accounts';

beforeEach(() => clearCaches());
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const balances = [
	{ name: 'ARC token', symbol: 'ARC', balance: '2000000', decimals: 6, imageUrl: '', usdValue: null, verified: 1, accountId: 'wallet', assetType: 'arc200', contractId: 123 },
	{ name: 'ASA token', symbol: 'ASA', balance: '3000000', decimals: 6, imageUrl: '', usdValue: null, verified: 1, accountId: 'wallet', assetType: 'asa', contractId: 456 }
];

function fakeFetch(approvals: 'ok' | 'reject' | '500' = 'ok', balancesStatus = 200): typeof fetch {
	return async (input) => {
		const url = new URL(String(input));
		if (url.pathname === '/account/assets') {
			return Response.json({ balances, 'next-token': null, 'total-count': 2, 'current-round': 100 }, { status: balancesStatus });
		}
		assert.equal(url.pathname, '/arc200/approvals');
		if (approvals === 'reject') throw new Error('approvals network error');
		return Response.json({ approvals: [] }, { status: approvals === '500' ? 500 : 200 });
	};
}

function assertBalanceTokens(tokens: Awaited<ReturnType<typeof fetchFungibleTokens>>['tokens']) {
	assert.deepEqual(tokens.map((token) => ({ id: token.id, balance: token.balance, type: token.type })), [
		{ id: '123', balance: 2000000, type: 'arc200' },
		{ id: '456', balance: 3000000, type: 'vsa' }
	]);
}

test('pool failure preserves balance tokens and reports partial enrichment', async () => {
	const result = await fetchFungibleTokens('wallet', 0.0002, {
		getLiquidityPools: async () => { throw new Error('pools unavailable'); }, fetch: fakeFetch()
	});
	assertBalanceTokens(result.tokens);
	assert.equal(result.partial, true);
});

test('both approvals network failures preserve balance tokens and report partial enrichment', async () => {
	const result = await fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools: async () => [], fetch: fakeFetch('reject') });
	assertBalanceTokens(result.tokens);
	assert.equal(result.partial, true);
});

test('non-ok approvals preserve balance tokens and report partial enrichment', async () => {
	const result = await fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools: async () => [], fetch: fakeFetch('500') });
	assertBalanceTokens(result.tokens);
	assert.equal(result.partial, true);
});

for (const failure of ['500', 'reject', '200 empty'] as const) {
	test(`approval-only token details ${failure} preserves balances and reports partial enrichment`, async () => {
		let detailsRequested = false;
		const result = await fetchFungibleTokens('wallet', 0.0002, {
			getLiquidityPools: async () => [],
			fetch: async (input) => {
				const url = new URL(String(input));
				if (url.pathname === '/arc200/approvals') {
					return Response.json({ approvals: [{ contractId: 789, amount: '1000000' }] });
				}
				if (url.pathname === '/arc200/tokens') {
					assert.equal(url.searchParams.get('contractId'), '789');
					detailsRequested = true;
					if (failure === 'reject') throw new Error('token details network error');
					if (failure === '200 empty') return Response.json({ tokens: [] });
					return new Response(null, { status: 500 });
				}
				return fakeFetch()(input);
			}
		});
		assert.equal(detailsRequested, true);
		assertBalanceTokens(result.tokens);
		assert.equal(result.partial, true);
	});
}

test('a balances 500 rejects instead of returning an empty list', async () => {
	await assert.rejects(fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools: async () => [], fetch: fakeFetch('ok', 500) }), /Failed to fetch token balances/);
});

test('successful sources return balance tokens without partial enrichment', async () => {
	const result = await fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools: async () => [], fetch: fakeFetch() });
	assertBalanceTokens(result.tokens);
	assert.equal(result.partial, false);
});

function lpPool(provider = 'humble'): PoolInfo {
	return {
		poolId: '123',
		tokAId: '0',
		tokBId: '456',
		poolBalA: provider === 'nomadex' ? '' : '1000000',
		poolBalB: provider === 'nomadex' ? '' : '1000000',
		supply: provider === 'nomadex' ? '' : '10000000',
		tvl: 20,
		provider
	};
}

for (const failure of ['500', 'reject'] as const) {
	test(`Nomadex escrow ARC200 ${failure} preserves tokens and reports partial`, async () => {
		vi.spyOn(algodClient, 'accountInformation').mockImplementation(() => ({ do: async () => ({ amount: 10_000_000 }) }) as unknown as ReturnType<typeof algodClient.accountInformation>);
		const result = await fetchFungibleTokens('wallet', 0.0002, {
			getLiquidityPools: async () => [lpPool('nomadex')],
			fetch: async (input) => {
				if (new URL(String(input)).pathname === '/arc200/balances') {
					if (failure === 'reject') throw new Error('escrow unavailable');
					return new Response(null, { status: 500 });
				}
				return fakeFetch()(input);
			}
		});
		assertBalanceTokens(result.tokens);
		assert.equal(result.partial, true);
	});
}

test('Nomadex Algod escrow fallback preserves tokens and reports partial', async () => {
	vi.spyOn(algodClient, 'accountInformation').mockImplementation(() => ({ do: async () => { throw new Error('Algod unavailable'); } }) as unknown as ReturnType<typeof algodClient.accountInformation>);
	const result = await fetchFungibleTokens('wallet', 0.0002, {
		getLiquidityPools: async () => [lpPool('nomadex')],
		fetch: async (input) => new URL(String(input)).pathname === '/arc200/balances'
			? Response.json({ balances: [{ balance: '-10000000' }] }) : fakeFetch()(input)
	});
	assertBalanceTokens(result.tokens);
	assert.equal(result.partial, true);
});

for (const failure of ['non-finite', 'throw'] as const) {
	test(`LP calculation ${failure} uses zero values and reports partial`, async () => {
		let reads = 0;
		const pool = lpPool();
		Object.defineProperty(pool, 'supply', { get() {
			if (++reads === 1) {
				if (failure === 'throw') throw new Error('invalid supply');
				return 'invalid';
			}
			return '10000000';
		} });
		const result = await fetchFungibleTokens('wallet', 0.0002, {
			getLiquidityPools: async () => [pool], fetch: fakeFetch()
		});
		assertBalanceTokens(result.tokens);
		assert.equal(result.tokens[0].value, 0);
		assert.equal(result.tokens[0].usdValue, 0);
		assert.equal(result.partial, true);
	});
}

test('NaN USD price uses zero values and reports partial', async () => {
	const result = await fetchFungibleTokens('wallet', 0.0002, {
		getLiquidityPools: async () => [],
		fetch: async (input) => new URL(String(input)).pathname === '/account/assets'
			? Response.json({ balances: [{ ...balances[0], usdValue: 'invalid' }], 'next-token': null })
			: fakeFetch()(input)
	});
	assert.equal(result.tokens[0].value, 0);
	assert.equal(result.tokens[0].usdValue, 0);
	assert.equal(result.partial, true);
});

// The assets API sends JSON null for unpriced tokens; 'null' and '' are guarded too (TASK-22 r4).
test("a missing USD price ('null', '' or null) is not partial", async () => {
	for (const usdValue of ['null', '', null]) {
		const result = await fetchFungibleTokens('wallet', 0.0002, {
			getLiquidityPools: async () => [],
			fetch: async (input) => new URL(String(input)).pathname === '/account/assets'
				? Response.json({ balances: [{ ...balances[0], usdValue }], 'next-token': null })
				: fakeFetch()(input)
		});
		assert.equal(result.partial, false, `usdValue ${JSON.stringify(usdValue)}`);
	}
});

// TASK-90: use the real pool loader so the control detects frozen reserve regressions.
const frozenNomadexPools = [
	{
		id: 411756,
		alphaId: 0,
		alphaType: 0,
		betaId: 302190,
		betaType: 1,
		balances: ['27090582273', '3261488'],
		apr: 9.06
	},
	{
		id: 412687,
		alphaId: 0,
		alphaType: 0,
		betaId: 412682,
		betaType: 2,
		balances: ['30942011079', '1158379867'],
		apr: 0
	},
	{
		id: 670599,
		alphaId: 420024,
		alphaType: 2,
		betaId: 300279,
		betaType: 2,
		balances: ['32508998005', '1282772'],
		apr: 0
	},
	{
		id: 48787612,
		alphaId: 0,
		alphaType: 0,
		betaId: 48146090,
		betaType: 1,
		balances: ['97654875118', '23376354'],
		apr: 0
	}
];

function nomadexSources(
	poolId: number,
	options: {
		dexFailure?: boolean;
		arcFailure?: '500' | 'reject' | 'empty' | 'invalid';
		supplyFailure?: boolean;
		usdValue?: string;
		userBalance?: string;
	} = {}
) {
	const calls: string[] = [];
	const fetchFn: typeof fetch = async (input) => {
		const url = new URL(String(input));
		calls.push(url.toString());
		if (url.pathname === '/account/assets') {
			return Response.json({
				balances: [
					{
						...balances[0],
						contractId: poolId,
						balance: options.userBalance ?? '1000000',
						usdValue: options.usdValue ?? null
					}
				],
				'next-token': null
			});
		}
		if (url.pathname === '/arc200/approvals') return Response.json({ approvals: [] });
		if (url.pathname === '/nomadex/index.php') {
			return Response.json(frozenNomadexPools);
		}
		if (url.pathname === '/dex/pools') {
			if (url.searchParams.get('exchange') !== 'nomadex') return Response.json({ pools: [] });
			if (options.dexFailure) return new Response(null, { status: 500 });
			return Response.json({
				pools: [
					{
						poolId: 411756,
						tokenA: { id: 0, balance: '26303164359', symbol: 'VOI' },
						tokenB: { id: 302190, balance: '3376582', symbol: 'aUSDC' },
						outstandingLpAmount: '115371457',
						exchange: 'nomadex'
					}
				]
			});
		}
		assert.equal(url.pathname, '/arc200/balances');
		assert.equal(url.searchParams.get('accountId'), algosdk.getApplicationAddress(poolId));
		const contractId = url.searchParams.get('contractId');
		if (contractId === String(poolId) && options.supplyFailure)
			return new Response(null, { status: 500 });
		if (contractId !== String(poolId) && options.arcFailure) {
			if (options.arcFailure === 'reject') throw new Error('ARC200 unavailable');
			if (options.arcFailure === 'empty') return Response.json({ balances: [] });
			if (options.arcFailure === 'invalid')
				return Response.json({ balances: [{ balance: 'invalid' }] });
			return new Response(null, { status: 500 });
		}
		return Response.json({
			balances: [{ balance: contractId === String(poolId) ? '-115371457' : '7000000' }]
		});
	};
	vi.stubGlobal('fetch', fetchFn);
	return { fetchFn, calls };
}

function mockEscrow(amount = 26303164359, assets: Record<string, number>[] = []) {
	return vi.spyOn(algodClient, 'accountInformation').mockImplementation(
		() =>
			({
				do: async () => ({ amount, assets })
			}) as unknown as ReturnType<typeof algodClient.accountInformation>
	);
}

test('red control: pool 411756 values one LP and shows live reserves instead of frozen proxy balances', async () => {
	const accountRead = mockEscrow();
	const { fetchFn, calls } = nomadexSources(411756);
	const result = await fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools, fetch: fetchFn });
	const token = result.tokens[0];
	const expected = 2 * 26303.164359 * (1 / 115.371457);
	assert.ok(Math.abs(token.value - expected) < 1e-9, `${token.value} != ${expected}`);
	assert.equal(token.poolInfo?.tokABalance, '26303164359');
	assert.equal(token.poolInfo?.tokBBalance, '3376582');
	assert.equal(token.poolInfo?.totalSupply, 115371457);
	assert.equal(token.poolInfo?.apr, 0);
	assert.equal(result.partial, false);
	assert.equal(
		calls.some((url) => url.includes('/arc200/balances')),
		false
	);
	assert.equal(accountRead.mock.calls.length, 0);
});

test('TASK-91 a pool-valued token has a null USD value without a VOI price, not $0', async () => {
	mockEscrow();
	const priced = await fetchFungibleTokens('wallet', 0.0002, {
		getLiquidityPools,
		fetch: nomadexSources(411756).fetchFn
	});
	assert.ok(Math.abs((priced.tokens[0].usdValue ?? NaN) - priced.tokens[0].value * 0.0002) < 1e-12);
	const unpriced = await fetchFungibleTokens('wallet', 0, {
		getLiquidityPools,
		fetch: nomadexSources(411756).fetchFn
	});
	assert.equal(unpriced.tokens[0].usdValue, null);
	assert.ok(unpriced.tokens[0].value > 0);
});

test('missing Mimir VOI/ASA pool reads both reserves from one escrow account response', async () => {
	const accountRead = mockEscrow(98000000000, [{ 'asset-id': 48146090, amount: 24000000 }]);
	const { fetchFn } = nomadexSources(48787612);
	const result = await fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools, fetch: fetchFn });
	assert.equal(result.tokens[0].poolInfo?.tokABalance, '98000000000');
	assert.equal(result.tokens[0].poolInfo?.tokBBalance, '24000000');
	assert.equal(result.tokens[0].poolInfo?.tvl, 196000000000);
	assert.ok(Math.abs(result.tokens[0].value - 196000 / 115.371457) < 1e-9);
	assert.equal(accountRead.mock.calls.length, 1);
	assert.equal(result.partial, false);
});

test('an ASA reserve is read from a camelCase holding too (algosdk v3 models)', async () => {
	// algosdk 2.10 returns raw REST JSON (`asset-id`, measured 10-30 on the 48787612 escrow); v3 returns `assetId`.
	mockEscrow(98000000000, [{ assetId: 48146090, amount: 24000000 }]);
	const { fetchFn } = nomadexSources(48787612);
	const result = await fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools, fetch: fetchFn });
	assert.equal(result.tokens[0].poolInfo?.tokBBalance, '24000000');
});

test('Nomadex LP valuation uses live reserves even if the asset API provides a USD quote', async () => {
	mockEscrow();
	const { fetchFn } = nomadexSources(411756, { usdValue: '999' });
	const result = await fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools, fetch: fetchFn });
	assert.ok(Math.abs(result.tokens[0].value - 52606.328718 / 115.371457) < 1e-9);
	assert.equal(result.partial, false);
});

test('missing Mimir VOI/ARC200 pool reads the token reserve through arc200 balances', async () => {
	mockEscrow();
	const { fetchFn, calls } = nomadexSources(412687);
	const result = await fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools, fetch: fetchFn });
	assert.equal(result.tokens[0].poolInfo?.tokABalance, '26303164359');
	assert.equal(result.tokens[0].poolInfo?.tokBBalance, '7000000');
	assert.equal(
		calls.some((url) => url.includes('contractId=412682&')),
		true
	);
	assert.equal(result.partial, false);
});

test('failed Mimir dex call still values a held pool using escrow reserves and supply', async () => {
	mockEscrow(26303164359, [{ 'asset-id': 302190, amount: 3376582 }]);
	const { fetchFn } = nomadexSources(411756, { dexFailure: true });
	const result = await fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools, fetch: fetchFn });
	assert.ok(Math.abs(result.tokens[0].value - 52606.328718 / 115.371457) < 1e-9);
	assert.equal(result.tokens[0].poolInfo?.tokBBalance, '3376582');
	assert.equal(result.partial, false);
});

for (const arcFailure of ['500', 'reject', 'empty', 'invalid'] as const) {
	test(`failed per-pool ARC200 read (${arcFailure}) rejects incomplete valuation and marks partial`, async () => {
		mockEscrow();
		const { fetchFn } = nomadexSources(412687, { arcFailure });
		const result = await fetchFungibleTokens('wallet', 0.0002, {
			getLiquidityPools,
			fetch: fetchFn
		});
		assert.equal(result.partial, true);
		// Preserve the service's existing zero fallback for unavailable valuations.
		assert.equal(result.tokens[0].value, 0);
		assert.equal(result.tokens[0].poolInfo?.tokBBalance, '');
	});
}

test('a missing ASA holding is a live zero reserve', async () => {
	mockEscrow();
	const { fetchFn } = nomadexSources(48787612);
	const result = await fetchFungibleTokens('wallet', 0, { getLiquidityPools, fetch: fetchFn });
	assert.equal(result.tokens[0].poolInfo?.tokBBalance, '0');
	assert.equal(result.partial, false);
});

test('a failed escrow account read leaves the value unavailable and marks partial', async () => {
	vi.spyOn(algodClient, 'accountInformation').mockImplementation(
		() =>
			({
				do: async () => {
					throw new Error('Algod unavailable');
				}
			}) as unknown as ReturnType<typeof algodClient.accountInformation>
	);
	const { fetchFn } = nomadexSources(48787612);
	const result = await fetchFungibleTokens('wallet', 0, { getLiquidityPools, fetch: fetchFn });
	assert.equal(result.partial, true);
	assert.equal(result.tokens[0].value, 0);
	assert.equal(result.tokens[0].poolInfo?.tokABalance, '');
});

test('failed LP supply read cannot value otherwise complete live reserves', async () => {
	mockEscrow();
	const { fetchFn } = nomadexSources(412687, { supplyFailure: true });
	const result = await fetchFungibleTokens('wallet', 0, { getLiquidityPools, fetch: fetchFn });
	assert.equal(result.partial, true);
	assert.equal(result.tokens[0].value, 0);
	assert.equal(result.tokens[0].poolInfo?.totalSupply, 0);
});

test('ARC200/ARC200 pools keep a zero TVL and value despite live reserves', async () => {
	const accountRead = mockEscrow();
	const { fetchFn } = nomadexSources(670599);
	const result = await fetchFungibleTokens('wallet', 0, { getLiquidityPools, fetch: fetchFn });
	assert.equal(result.tokens[0].poolInfo?.tokABalance, '7000000');
	assert.equal(result.tokens[0].poolInfo?.tokBBalance, '7000000');
	assert.equal(result.tokens[0].poolInfo?.tvl, 0);
	assert.equal(result.tokens[0].value, 0);
	assert.equal(accountRead.mock.calls.length, 0);
	assert.equal(result.partial, false);
});

test('unheld Nomadex pools do not trigger per-pool reads', async () => {
	const accountRead = mockEscrow();
	const { fetchFn, calls } = nomadexSources(48787612, { userBalance: '0' });
	await fetchFungibleTokens('wallet', 0, { getLiquidityPools, fetch: fetchFn });
	assert.equal(accountRead.mock.calls.length, 0);
	assert.equal(
		calls.some((url) => url.includes('/arc200/balances')),
		false
	);
});

test('Humble LP valuation is unchanged and its card supply stays in base units', async () => {
	const result = await fetchFungibleTokens('wallet', 0.0002, {
		getLiquidityPools: async () => [lpPool()],
		fetch: fakeFetch()
	});
	assert.equal(result.tokens[0].value, 4);
	assert.equal(result.tokens[0].usdValue, 0.0008);
	// TASK-97: was supply x 1e6, which put the pool share 1e6 too low ("0.00% of pool").
	assert.equal(result.tokens[0].poolInfo?.totalSupply, 10000000);
	assert.equal(result.partial, false);
});

test('a Humble LP takes side decimals from the pool when the holder lacks the token', async () => {
	// TASK-97: only the holder's own balances supplied decimals, so an unheld 8-decimal
	// side fell back to 6.
	vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
		new URL(String(input)).searchParams.get('exchange') === 'nomadex'
			? Response.json({ pools: [] })
			: Response.json({
					pools: [
						{
							poolId: 40180060,
							tokenA: { id: 390001, type: 'ARC200', symbol: 'wVOI', balance: '87625948837', decimals: 6 },
							tokenB: { id: 40153368, type: 'ARC200', symbol: 'aBTC', balance: '26640', decimals: 8 },
							exchange: 'humble',
							escrowAddress: 'ESCROW',
							outstandingLpAmount: '47278775'
						}
					]
				})
	);
	const held = [
		{ name: 'Humble LP', symbol: 'HLP', balance: '31238745', decimals: 6, imageUrl: '', usdValue: null, verified: 0, accountId: 'wallet', assetType: 'arc200', contractId: 40180060 }
	];
	const result = await fetchFungibleTokens('wallet', 0.0002, {
		getLiquidityPools,
		fetch: async (input) =>
			new URL(String(input)).pathname === '/account/assets'
				? Response.json({ balances: held, 'next-token': null, 'total-count': 1, 'current-round': 100 })
				: Response.json({ approvals: [] })
	});
	const lp = result.tokens.find((token) => token.id === '40180060');
	assert.deepEqual(
		{
			tokADecimals: lp?.poolInfo?.tokADecimals,
			tokBDecimals: lp?.poolInfo?.tokBDecimals,
			tokBSymbol: lp?.poolInfo?.tokBSymbol,
			totalSupply: lp?.poolInfo?.totalSupply
		},
		{ tokADecimals: 6, tokBDecimals: 8, tokBSymbol: 'aBTC', totalSupply: 47278775 }
	);
});

test('a token only in a Nomadex pool gets no Humble swap link', async () => {
	// TASK-97: the first pool holding the token won, so a Nomadex pool id reached humble.sh.
	const result = await fetchFungibleTokens('wallet', 0.0002, {
		getLiquidityPools: async () => [{ ...lpPool('nomadex'), poolId: '999', tokBId: '777' }],
		fetch: async (input) =>
			new URL(String(input)).pathname === '/account/assets'
				? Response.json({
						balances: [{ name: 'T', symbol: 'T', balance: '1', decimals: 0, imageUrl: '', usdValue: null, verified: 1, accountId: 'wallet', assetType: 'arc200', contractId: 777 }],
						'next-token': null,
						'total-count': 1,
						'current-round': 100
					})
				: Response.json({ approvals: [] })
	});
	assert.equal(result.tokens.find((token) => token.id === '777')?.poolId, undefined);
});

test('a Humble LP resolves its tokens from balances and a token links to its Humble pool', async () => {
	// TASK-33: Humble ids were numbers, so these string lookups never matched and an
	// 18-decimal side fell back to 6 decimals, with APR NaN.
	vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
		new URL(String(input)).searchParams.get('exchange') === 'nomadex'
			? Response.json({ pools: [] })
			: Response.json({
					pools: [
						{
							poolId: 777,
							tokenA: { id: 390001, type: 'ARC200', symbol: 'wVOI', balance: '5000000', decimals: 6 },
							tokenB: { id: 401384, type: 'ARC200', symbol: 'ROCKET', balance: '9000000000000000000', decimals: 18 },
							exchange: 'humble',
							escrowAddress: 'ESCROW',
							outstandingLpAmount: '1000000'
						}
					]
				})
	);
	const held = [
		{ name: 'Humble LP', symbol: 'HLP', balance: '100000', decimals: 6, imageUrl: '', usdValue: null, verified: 0, accountId: 'wallet', assetType: 'arc200', contractId: 777 },
		{ name: 'Rocket', symbol: 'ROCKET', balance: '1000000000000000000', decimals: 18, imageUrl: '', usdValue: null, verified: 1, accountId: 'wallet', assetType: 'arc200', contractId: 401384 }
	];
	const result = await fetchFungibleTokens('wallet', 0.0002, {
		getLiquidityPools,
		fetch: async (input) =>
			new URL(String(input)).pathname === '/account/assets'
				? Response.json({ balances: held, 'next-token': null, 'total-count': 2, 'current-round': 100 })
				: Response.json({ approvals: [] })
	});
	const lp = result.tokens.find((token) => token.id === '777');
	assert.deepEqual(
		{
			tokAId: lp?.poolInfo?.tokAId,
			tokBId: lp?.poolInfo?.tokBId,
			tokBSymbol: lp?.poolInfo?.tokBSymbol,
			tokBDecimals: lp?.poolInfo?.tokBDecimals,
			apr: lp?.poolInfo?.apr
		},
		{ tokAId: '0', tokBId: '401384', tokBSymbol: 'ROCKET', tokBDecimals: 18, apr: 0 }
	);
	assert.equal(result.tokens.find((token) => token.id === '401384')?.poolId, '777');
});

test('a token in an emptied Humble pool and a live one links to the live pool', async () => {
	// Live 2026-10-30: GM (300279) is in 395555 (LP supply 0) and 395554 (TASK-33 r1).
	const gm = { id: 300279, type: 'ARC200', symbol: 'GM', decimals: 2 };
	const wvoi = { id: 390001, type: 'ARC200', symbol: 'wVOI', decimals: 6 };
	vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
		new URL(String(input)).searchParams.get('exchange') === 'nomadex'
			? Response.json({ pools: [] })
			: Response.json({
					pools: [
						{ poolId: 395555, tokenA: { ...gm, balance: '0' }, tokenB: { ...wvoi, balance: '0' }, exchange: 'humble', escrowAddress: 'A', outstandingLpAmount: '0' },
						{ poolId: 395554, tokenA: { ...wvoi, balance: '5' }, tokenB: { ...gm, balance: '7' }, exchange: 'humble', escrowAddress: 'B', outstandingLpAmount: '6949611087' }
					]
				})
	);
	const held = [{ name: 'GM', symbol: 'GM', balance: '100', decimals: 2, imageUrl: '', usdValue: null, verified: 1, accountId: 'wallet', assetType: 'arc200', contractId: 300279 }];
	const result = await fetchFungibleTokens('wallet', 0.0002, {
		getLiquidityPools,
		fetch: async (input) =>
			new URL(String(input)).pathname === '/account/assets'
				? Response.json({ balances: held, 'next-token': null, 'total-count': 1, 'current-round': 100 })
				: Response.json({ approvals: [] })
	});
	assert.equal(result.tokens.find((token) => token.id === '300279')?.poolId, '395554');
});
