import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), supply: vi.fn() }));
vi.mock('$lib/mimir', () => ({ mimirClient: mocks }));
vi.mock('$lib/server/supabase', () => ({ supabasePrivateClient: mocks }));
vi.mock('$lib/utils/voi', () => ({ fetchCirculatingSupply: mocks.supply }));

import { GET as markets } from '../../routes/api/markets/+server';
import { GET as epochs } from '../../routes/api/epochs/+server';
import { GET as medium } from '../../routes/api/medium-posts/+server';
import { GET as mimir } from '../../routes/api/mimir/+server';
import { GET as supply } from '../../routes/api/token-supply/+server';
import { GET as analytics } from '../../routes/api/token-analytics/+server';
import { GET as info } from '../../routes/api/token-info/+server';
import { GET as pairs, POST as pairPost } from '../../routes/api/token-pairs/+server';
import { GET as tokens } from '../../routes/api/tokens/+server';
import { GET as poolAnalytics } from '../../routes/api/pool-analytics/+server';
import { GET as history } from '../../routes/api/price-history/+server';
import { GET as price } from '../../routes/api/voi-price/+server';

const pool = {
	pool_id: 1,
	token_a_id: 0,
	token_b_id: 123,
	token_a_symbol: 'VOI',
	token_b_symbol: 'USDC',
	token_a_decimals: 6,
	token_b_decimals: 6
};
let stalled = '';
const signals: Array<{ site: string; signal: AbortSignal }> = [];

// Like postgrest-js without throwOnError: aborting fetch resolves a result with error.
function query(site: string, data: unknown) {
	let signal: AbortSignal | undefined;
	const builder = {
		select: (columns: string) => {
			if (site === 'arc200_contracts' && columns === 'algo_asset_id') {
				site = 'algo_asset_id';
				data = { algo_asset_id: 456 };
			}
			return builder;
		},
		or: () => builder,
		eq: () => builder,
		in: () => builder,
		order: () => builder,
		limit: () => builder,
		maybeSingle: () => builder,
		single: () => builder,
		abortSignal: (value: AbortSignal) => {
			signal = value;
			signals.push({ site, signal });
			return builder;
		},
		then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
			const result =
				site === stalled
					? new Promise((done) => {
							const abort = () => done({ data: null, error: { message: 'upstream aborted' } });
							if (signal?.aborted) abort();
							else signal?.addEventListener('abort', abort, { once: true });
						})
					: Promise.resolve({ data, error: null });
			return result.then(resolve, reject);
		}
	};
	return builder;
}

const event = (
	path: string,
	fetcher: typeof fetch = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]))
) =>
	({
		url: new URL(path, 'https://example.test'),
		fetch: fetcher,
		request: new Request('https://example.test', {
			method: 'POST',
			body: JSON.stringify({ baseTokenId: 0, quoteTokenId: 123 })
		})
	}) as never;

beforeEach(() => {
	vi.useFakeTimers();
	// Node's native AbortSignal.timeout does not use Vitest's fake clock.
	vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
		return controller.signal;
	});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	signals.length = 0;
	stalled = '';
	mocks.from.mockImplementation((site: string) =>
		query(site, site === 'pool_catalog' ? [pool] : [])
	);
	mocks.rpc.mockImplementation((site: string) =>
		query(site, site === 'get_arc200_pools' ? { pools: [{ tokenA: {}, tokenB: {} }] } : [])
	);
	mocks.supply.mockResolvedValue({ circulatingSupply: '10', percentDistributed: '1' });
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([])));
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it.each([
	['markets catalog', markets, '/api/markets', 'pool_catalog', 500],
	['markets aggregates', markets, '/api/markets', 'get_pool_aggregates', 500],
	['markets equivalents', markets, '/api/markets', 'arc200_contracts', 200],
	['markets snapshots', markets, '/api/markets', 'market_snapshots', 200],
	['markets algo id', markets, '/api/markets', 'algo_asset_id', 200],
	['mimir', mimir, '/api/mimir', 'get_online_account_count', 500],
	['token supply', supply, '/api/token-supply?tokenIds=123', 'arc200_contracts', 500],
	['token info', info, '/api/token-info?tokenId=0', 'arc200_contracts', 200],
	['token analytics', analytics, '/api/token-analytics?tokenId=0', 'pool_catalog', 200],
	['token pairs GET', pairs, '/api/token-pairs', 'pool_catalog', 500],
	['token pairs POST', pairPost, '/api/token-pairs', 'pool_catalog', 500],
	['tokens', tokens, '/api/tokens', 'pool_catalog', 500],
	['pool data', poolAnalytics, '/api/pool-analytics?poolId=1', 'get_arc200_pools', 502],
	['pool aggregates', poolAnalytics, '/api/pool-analytics?poolId=1', 'get_pool_aggregates', 200],
	['price history', history, '/api/price-history', 'get_price_history', 500],
	['voi price', price, '/api/voi-price', 'get_price_history', 200]
] as const)(
	'%s settles through its existing error path within 5100ms',
	async (_, handler, path, site, status) => {
		stalled = site;
		let response: Response | undefined;
		const pending = Promise.resolve(handler(event(path))).then((value) => {
			response = value;
		});
		await vi.advanceTimersByTimeAsync(5100);
		expect(response, 'handler must settle by its deadline').toBeDefined();
		await pending;
		expect(response!.status).toBe(status);
		expect(response!.headers.has('cache-control')).toBe(false);
		const recorded = signals.filter((entry) => entry.site === site);
		expect(recorded.length).toBeGreaterThan(0);
		for (const { signal } of recorded) {
			expect(signal).toBeInstanceOf(AbortSignal);
			expect(signal.aborted).toBe(true);
		}
		expect(AbortSignal.timeout).toHaveBeenCalledWith(5000);
		const body = await response!.json();
		if (status >= 400) expect(body.error).toBeTruthy();
		if (path.includes('analytics') && status === 200) expect(body.partial).toBe(true);
	}
);

it.each([
	['epochs', epochs, '/api/epochs', 5000, 500],
	['medium', medium, '/api/medium-posts', 3000, 200]
] as const)(
	'%s bounds stalled headers AND bodies even when abort is ignored',
	async (_, handler, path, timeout, status) => {
		for (const stage of ['headers', 'body']) {
			const upstream = Response.json({});
			const body = vi.fn(() => new Promise<never>(() => {}));
			vi.spyOn(upstream, path.includes('epochs') ? 'json' : 'text').mockImplementation(body);
			const fetcher = vi
				.fn<typeof fetch>()
				.mockImplementation(() =>
					stage === 'headers' ? new Promise(() => {}) : Promise.resolve(upstream)
				);
			vi.stubGlobal('fetch', fetcher);
			let response: Response | undefined;
			const pending = Promise.resolve(handler(event(path, fetcher))).then((value) => {
				response = value;
			});
			await vi.advanceTimersByTimeAsync(timeout - 1);
			expect(response).toBeUndefined();
			if (stage === 'body') expect(body).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(101);
			expect(response, 'handler must settle by its deadline').toBeDefined();
			await pending;
			expect(response!.status).toBe(status);
			expect(response!.headers.has('cache-control')).toBe(false);
			expect(await response!.json()).toEqual(
				status === 500 ? { error: 'Failed to fetch epoch data' } : []
			);
			expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
		}
	}
);

it('medium does not parse a non-ok response as a feed or cache it', async () => {
	const response = new Response(
		'<rss><channel><item><title>one</title></item><item><title>two</title></item></channel></rss>',
		{ status: 503 }
	);
	const read = vi.spyOn(response, 'text');
	const result = await medium(event('/api/medium-posts', vi.fn().mockResolvedValue(response)));
	expect(await result.json()).toEqual([]);
	expect(result.headers.has('cache-control')).toBe(false);
	expect(read).not.toHaveBeenCalled();
});

it('markets bounds a stalled price-history self-fetch and keeps its unavailable fallback', async () => {
	let response: Response | undefined;
	const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
	Promise.resolve(markets(event('/api/markets', fetcher))).then((value) => {
		response = value;
	});
	await vi.advanceTimersByTimeAsync(3100);
	expect(response).toBeDefined();
	expect(response!.status).toBe(200);
	expect(await response!.json()).toMatchObject({ voiUsdStatus: 'unavailable' });
	expect(response!.headers.has('cache-control')).toBe(false);
	expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
});

it.each(['pools', 'assets', 'protocols'])(
	'markets gives the entire Vestige chain one 4000ms budget when %s stalls',
	async (stage) => {
		const calls: AbortSignal[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string, init?: RequestInit) => {
				calls.push(init?.signal as AbortSignal);
				if (input.includes(`/${stage}?`)) {
					const response = Response.json({});
					vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}));
					return response;
				}
				// Spend some of the same budget at each preceding stage.
				await new Promise((resolve) => setTimeout(resolve, 1200));
				if (input.includes('/pools?'))
					return Response.json({
						results: [
							{
								id: 99,
								asset_1_id: 456,
								asset_2_id: 789,
								asset_1_supply: 10,
								asset_2_supply: 10,
								protocol_id: 0
							}
						]
					});
				return Response.json([
					{ id: 456, ticker: 'USDC', decimals: 0 },
					{ id: 789, ticker: 'USDT', decimals: 0 }
				]);
			})
		);
		let response: Response | undefined;
		const reference = vi
			.fn()
			.mockResolvedValue(Response.json([{ time: new Date().toISOString(), value: 0.01 }]));
		Promise.resolve(markets(event('/api/markets', reference))).then((value) => {
			response = value;
		});
		await vi.advanceTimersByTimeAsync(4100);
		expect(response, 'the chain shares a single deadline').toBeDefined();
		expect(response!.status).toBe(200);
		expect(await response!.json()).toMatchObject({
			marketData: [expect.objectContaining({ trading_pair_id: 1 })]
		});
		expect(response!.headers.has('cache-control')).toBe(false);
		expect(calls.length).toBeGreaterThan(0);
		expect(new Set(calls).size).toBe(1);
		for (const signal of calls) expect(signal?.aborted).toBe(true);
	}
);
