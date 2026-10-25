import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	rpc: vi.fn(),
	supply: vi.fn(),
	vestige: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({ from: mocks.from, rpc: mocks.rpc })
}));
vi.mock('$lib/supabase-server', () => ({
	supabasePrivateClient: { from: mocks.from, rpc: mocks.rpc }
}));
vi.mock('$env/static/public', () => ({
	PUBLIC_MIMIR_URL: 'https://mimir.invalid',
	PUBLIC_MIMIR_ANON_KEY: 'test'
}));
vi.mock('$lib/utils/voi', () => ({ fetchCirculatingSupply: mocks.supply }));
vi.mock('$lib/utils/vestige', () => ({ fetchVestigeMarketsForAsset: mocks.vestige }));

import { GET as marketsGET } from '../../routes/api/markets/+server';
import { GET as tokenGET, OPTIONS as tokenOPTIONS } from '../../routes/api/token-analytics/+server';
import { GET as poolGET } from '../../routes/api/pool-analytics/+server';
import { GET as infoGET } from '../../routes/api/token-info/+server';
import { GET as mediumGET } from '../../routes/api/medium-posts/+server';
import { GET as epochsGET } from '../../routes/api/epochs/+server';

const minuteCache = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
const analyticsCache = 'public, max-age=0, s-maxage=120, stale-while-revalidate=600';
const hourlyCache = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400';
const pool = {
	pool_id: 1,
	token_a_id: 0,
	token_a_symbol: 'VOI',
	token_a_decimals: 6,
	token_b_id: 123,
	token_b_symbol: 'USDC',
	token_b_decimals: 6
};

function query(data: unknown, error: unknown = null) {
	const result = Promise.resolve({ data, error });
	const builder = {
		select: () => builder,
		or: () => builder,
		eq: () => builder,
		limit: () => builder,
		ilike: () => builder,
		neq: () => builder,
		order: () => builder,
		single: () => result,
		maybeSingle: () => result,
		then: result.then.bind(result)
	};
	return builder;
}

function event(path: string, fetcher = vi.fn()) {
	return { url: new URL(path, 'https://example.test'), fetch: fetcher } as unknown as RequestEvent;
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.from.mockImplementation((table: string) => query(table === 'pool_catalog' ? [pool] : null));
	mocks.rpc.mockResolvedValue({ data: [], error: null });
	mocks.supply.mockResolvedValue({ circulatingSupply: '10', percentDistributed: '1' });
	mocks.vestige.mockResolvedValue([]);
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('TASK-29 markets response caching', () => {
	it.each(['ok', 'stale'])('caches a complete result with %s VOI/USD status', async (status) => {
		const time = new Date(Date.now() - (status === 'stale' ? 7_200_000 : 0)).toISOString();
		const fetcher = vi.fn().mockResolvedValue(Response.json([{ time, value: 0.01 }]));
		const response = await marketsGET(event('/api/markets?tokenId=123', fetcher));
		expect(response.status).toBe(200);
		expect((await response.json()).voiUsdStatus).toBe(status);
		expect(response.headers.get('Cache-Control')).toBe(minuteCache);
	});

	it('caches genuine empty pools and the legacy empty market list', async () => {
		mocks.from.mockImplementation(() => query([]));
		for (const path of ['/api/markets?tokenId=123', '/api/markets']) {
			const response = await marketsGET(event(path));
			expect((await response.json()).marketData).toEqual([]);
			expect(response.headers.get('Cache-Control')).toBe(minuteCache);
		}
	});

	it.each(['unavailable', 'invalid'])('does not cache %s VOI/USD results', async (status) => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(
				Response.json(status === 'invalid' ? [{ time: new Date().toISOString(), value: 0 }] : [])
			);
		const response = await marketsGET(event('/api/markets?tokenId=123', fetcher));
		expect(response.status).toBe(200);
		expect((await response.json()).voiUsdStatus).toBe(status);
		expect(response.headers.has('Cache-Control')).toBe(false);
	});

	it('does not cache database failures or invalid input', async () => {
		mocks.from.mockImplementation(() => query(null, new Error('database unavailable')));
		for (const [id, status] of [
			['123', 500],
			['invalid', 400]
		] as const) {
			const response = await marketsGET(event(`/api/markets?tokenId=${id}`));
			expect(response.status).toBe(status);
			expect(response.headers.has('Cache-Control')).toBe(false);
		}
	});
});

describe('TASK-29 analytics response caching', () => {
	it('caches complete token analytics, including genuine zero metrics', async () => {
		mocks.from.mockImplementation(() => query([]));
		const response = await tokenGET(event('/api/token-analytics?tokenId=0'));
		expect(response.status).toBe(200);
		expect((await response.json()).partial).toBe(false);
		expect(response.headers.get('Cache-Control')).toBe(analyticsCache);
	});

	it.each(['equivalents', 'aggregates'])(
		'does not cache token analytics missing %s',
		async (reason) => {
			if (reason === 'equivalents') {
				mocks.from.mockImplementation((table: string) =>
					query([], table === 'arc200_contracts' ? new Error('unavailable') : null)
				);
			} else {
				mocks.rpc.mockResolvedValue({ data: null, error: new Error('unavailable') });
			}
			const response = await tokenGET(event('/api/token-analytics?tokenId=0'));
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ partial: true, partialReasons: [reason] });
			expect(response.headers.has('Cache-Control')).toBe(false);
		}
	);

	it('does not cache a 500 caused by malformed aggregate data', async () => {
		mocks.rpc.mockResolvedValue({ data: [{ pool_id: 1, sides: null }], error: null });
		const response = await tokenGET(event('/api/token-analytics?tokenId=0'));
		expect(response.status).toBe(500);
		expect((await response.json()).error).toBeTruthy();
		expect(response.headers.has('Cache-Control')).toBe(false);
	});

	it('does not cache OPTIONS', async () => {
		const response = await tokenOPTIONS(event('/api/token-analytics'));
		expect(response.status).toBe(200);
		expect(response.headers.has('Cache-Control')).toBe(false);
	});

	it.each([false, true])(
		'caches pool analytics only when partial is false (partial=%s)',
		async (partial) => {
			mocks.rpc.mockImplementation(async (name: string) =>
				name === 'get_arc200_pools'
					? {
							data: { pools: [{ tokenA: { balance: '1' }, tokenB: { balance: '2' } }] },
							error: null
						}
					: { data: [], error: partial ? new Error('unavailable') : null }
			);
			const response = await poolGET(event('/api/pool-analytics?poolId=1'));
			expect(response.status).toBe(200);
			expect((await response.json()).partial).toBe(partial);
			expect(response.headers.get('Cache-Control')).toBe(partial ? null : analyticsCache);
		}
	);
});

describe('TASK-29 VOI price response caching', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
	});

	it('caches a fetched positive price and the fresh in-memory response', async () => {
		const { GET } = await import('../../routes/api/voi-price/+server');
		mocks.rpc.mockResolvedValue({ data: [{ value: 0.01 }], error: null });
		for (let i = 0; i < 2; i++) {
			const response = await GET(event('/api/voi-price'));
			expect(response.status).toBe(200);
			expect((await response.json()).price).toBe(0.01);
			expect(response.headers.get('Cache-Control')).toBe(minuteCache);
		}
		expect(mocks.rpc).toHaveBeenCalledTimes(1);
	});

	it('does not cache the expired-cache fallback after an upstream 500', async () => {
		const { GET } = await import('../../routes/api/voi-price/+server');
		mocks.rpc.mockResolvedValueOnce({ data: [{ value: 0.01 }], error: null });
		await GET(event('/api/voi-price'));
		vi.advanceTimersByTime(5 * 60 * 1000);
		mocks.rpc.mockResolvedValue({
			data: null,
			error: { message: 'upstream failure', status: 500 }
		});
		const response = await GET(event('/api/voi-price'));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ price: 0.01, isStale: true });
		expect(response.headers.has('Cache-Control')).toBe(false);
	});

	it('does not cache an upstream 500 converted to an error-bearing 200', async () => {
		const { GET } = await import('../../routes/api/voi-price/+server');
		mocks.rpc.mockResolvedValue({
			data: null,
			error: { message: 'upstream failure', status: 500 }
		});
		const response = await GET(event('/api/voi-price'));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ price: 0, error: 'Failed to fetch price' });
		expect(response.headers.has('Cache-Control')).toBe(false);
	});

	it('does not cache a zero price returned by the data source', async () => {
		const { GET } = await import('../../routes/api/voi-price/+server');
		mocks.rpc.mockResolvedValue({ data: [{ value: 0 }], error: null });
		const response = await GET(event('/api/voi-price'));
		expect(response.status).toBe(200);
		expect((await response.json()).price).toBe(0);
		expect(response.headers.has('Cache-Control')).toBe(false);
	});
});

describe('TASK-29 hourly cache exclusions', () => {
	it('caches token info but does not cache a token not found by ID or symbol', async () => {
		const voi = await infoGET(event('/api/token-info?tokenId=0'));
		expect(voi.headers.get('Cache-Control')).toBe(hourlyCache);
		mocks.from.mockImplementation(() => query(null));
		for (const search of ['tokenId=123', 'symbol=MISSING']) {
			const response = await infoGET(event(`/api/token-info?${search}`));
			expect(await response.json()).toEqual({ info: null });
			expect(response.headers.has('Cache-Control')).toBe(false);
		}
	});

	it('caches parsed Medium posts but does not cache the upstream-failure empty fallback', async () => {
		const xml =
			'<rss><channel><item><title>One</title></item><item><title>Two</title></item></channel></rss>';
		const response = await mediumGET(
			event('/api/medium-posts', vi.fn().mockResolvedValue(new Response(xml)))
		);
		expect(response.headers.get('Cache-Control')).toBe(hourlyCache);
		const failure = await mediumGET(
			event('/api/medium-posts', vi.fn().mockRejectedValue(new Error('upstream failure')))
		);
		expect(await failure.json()).toEqual([]);
		expect(failure.headers.has('Cache-Control')).toBe(false);
	});

	it('does not cache posts parsed from an unsuccessful upstream response', async () => {
		const xml =
			'<rss><channel><item><title>One</title></item><item><title>Two</title></item></channel></rss>';
		const response = await mediumGET(
			event('/api/medium-posts', vi.fn().mockResolvedValue(new Response(xml, { status: 500 })))
		);
		expect(response.status).toBe(200);
		expect(response.headers.has('Cache-Control')).toBe(false);
	});
});

describe('TASK-29 epoch response caching', () => {
	it.each([false, true])(
		'does not cache an upstream error carried in a 200 body (error=%s)',
		async (error) => {
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockResolvedValue(
						Response.json(error ? { error: 'upstream failure' } : { epochs: [], current_epoch: 1 })
					)
			);
			const response = await epochsGET(event('/api/epochs'));
			expect(response.status).toBe(200);
			expect(response.headers.get('Cache-Control')).toBe(
				error ? null : 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600'
			);
		}
	);
});
