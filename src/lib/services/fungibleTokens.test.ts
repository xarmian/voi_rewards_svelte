import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFungibleTokens } from './fungibleTokens.ts';
import { algodClient } from '../utils/algod.ts';
import type { PoolInfo } from './lp.ts';

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
		poolId: '123', tokAId: '0', tokBId: '456', poolBalA: '1000000',
		poolBalB: '1000000', supply: '10000000', tvl: 20, provider
	};
}

for (const failure of ['500', 'reject'] as const) {
	test(`Nomadex escrow ARC200 ${failure} preserves tokens and reports partial`, async (t) => {
		t.mock.method(algodClient, 'accountInformation', () => ({ do: async () => ({ amount: 10_000_000 }) }));
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

test('Nomadex Algod escrow fallback preserves tokens and reports partial', async (t) => {
	t.mock.method(algodClient, 'accountInformation', () => ({ do: async () => { throw new Error('Algod unavailable'); } }));
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
