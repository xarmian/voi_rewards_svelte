import { afterEach, expect, test, vi } from 'vitest';
import { getLiquidityPools } from './lp';

afterEach(() => vi.unstubAllGlobals());

const livePool = {
	poolId: 411756,
	tokenA: { id: 302190, symbol: 'aUSDC', balance: '3376582' },
	tokenB: { id: 0, symbol: 'VOI', balance: '26303164359' },
	outstandingLpAmount: '115371457',
	exchange: 'nomadex'
};

function mockPools(failure?: '500' | 'reject') {
	const humble = {
		poolId: 123,
		tokenA: { id: 390001, symbol: 'wVOI', balance: '1000000' },
		tokenB: { id: 456, symbol: 'OTHER', balance: '2000000' },
		outstandingLpAmount: '9000000',
		exchange: 'humble',
		apr: '12.5'
	};
	const fetchFn = vi.fn<typeof fetch>(async (input) => {
		const url = new URL(String(input));
		if (url.searchParams.get('exchange') === 'nomadex') {
			if (failure === 'reject') throw new Error('Mimir unavailable');
			return Response.json({ pools: [livePool] }, { status: failure === '500' ? 500 : 200 });
		}
		if (url.hostname === 'api.voirewards.com') {
			return Response.json([
				{
					id: 411756,
					alphaId: 0,
					alphaType: 0,
					betaId: 302190,
					betaType: 1,
					balances: ['27090582273', '3261488'],
					apr: 9.06
				}
			]);
		}
		expect(url.searchParams.get('tokenId')).toBe('390001');
		return Response.json({ pools: [humble] });
	});
	vi.stubGlobal('fetch', fetchFn);
	return fetchFn;
}

test('Nomadex uses live Mimir reserves mapped by token ID and never requests the retired proxy', async () => {
	const fetchFn = mockPools();
	const pools = await getLiquidityPools();
	expect(pools.find((pool) => pool.poolId === '411756')).toMatchObject({
		tokAId: '0',
		tokBId: '302190',
		poolBalA: '26303164359',
		poolBalB: '3376582',
		supply: '115371457',
		tvl: 52606328718,
		apr: 0,
		provider: 'nomadex'
	});
	const urls = fetchFn.mock.calls.map(([input]) => String(input));
	expect(urls.some((url) => new URL(url).pathname.startsWith('/nomadex'))).toBe(false);
	expect(urls.filter((url) => url.includes('exchange=nomadex'))).toEqual([
		'https://voi-mainnet-mimirapi.voirewards.com/dex/pools?exchange=nomadex&limit=500'
	]);
	expect(pools.filter((pool) => pool.provider === 'nomadex')).toHaveLength(68);
	expect(pools.find((pool) => pool.poolId === '48787612')).toMatchObject({
		poolBalA: '',
		poolBalB: '',
		supply: '',
		tvl: 0,
		apr: 0
	});
});

for (const failure of ['500', 'reject'] as const) {
	test(`Mimir dex ${failure} retains all static Nomadex metadata with unknown balances`, async () => {
		mockPools(failure);
		const pools = await getLiquidityPools();
		const nomadex = pools.filter((pool) => pool.provider === 'nomadex');
		expect(nomadex).toHaveLength(68);
		expect(
			nomadex.every(
				(pool) =>
					pool.poolBalA === '' && pool.poolBalB === '' && pool.supply === '' && pool.apr === 0
			)
		).toBe(true);
	});
}

test('Humble mapping and units are unchanged', async () => {
	mockPools();
	const pools = await getLiquidityPools();
	expect(pools.find((pool) => pool.provider === 'humble')).toEqual({
		poolId: '123',
		tokAId: 0,
		tokBId: 456,
		poolBalA: '1000000',
		poolBalB: '2000000',
		supply: '9000000',
		provider: 'humble',
		tvl: 0,
		apr: 12.5,
		symbolA: 'VOI',
		symbolB: 'OTHER'
	});
});
