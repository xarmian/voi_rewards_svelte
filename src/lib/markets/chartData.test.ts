import { afterEach, expect, it, vi } from 'vitest';
import { createVoiUsdReference, fetchTokenChartData, fetchVOIChartData } from './chartData';

const candles = [{ time: 100, open: 2, high: 4, low: 1, close: 3, volume: 5 }];
const volumes = [{ time: 100, value: 10 }];
const reference = [{ time: 100, value: 0.002 }];

function jsonFetch(body: unknown, status = 200) {
	return vi.fn(async () => Response.json(body, { status }));
}

afterEach(() => {
	vi.restoreAllMocks();
});

it('dedupes concurrent reference requests, caches results and resets per instance', async () => {
	let resolve!: (response: Response) => void;
	const fetch = vi.fn(
		() =>
			new Promise<Response>((done) => {
				resolve = done;
			})
	);
	const cache = createVoiUsdReference(fetch);
	const first = cache.get();
	const second = cache.get();
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(fetch).toHaveBeenCalledWith('/api/price-history?period=24h&token=VOI');
	resolve(Response.json(reference));
	expect(await first).toEqual(reference);
	expect(await second).toEqual(reference);
	expect(await cache.get()).toEqual(reference);
	expect(fetch).toHaveBeenCalledTimes(1);
	cache.reset();
	const third = cache.get();
	expect(fetch).toHaveBeenCalledTimes(2);
	resolve(Response.json(reference));
	await third;
	const separate = createVoiUsdReference(fetch);
	const fourth = separate.get();
	expect(fetch).toHaveBeenCalledTimes(3);
	resolve(Response.json(reference));
	await fourth;
});

it('reset also clears an in-flight reference promise without cancelling the old request', async () => {
	const pending: ((response: Response) => void)[] = [];
	const fetch = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
	const cache = createVoiUsdReference(fetch);
	const first = cache.get();
	cache.reset();
	const second = cache.get();
	expect(fetch).toHaveBeenCalledTimes(2);
	pending[0](Response.json(reference));
	await first;
	// The old request still populates the cache, matching the component's existing behavior.
	expect(await cache.get()).toEqual(reference);
	pending[1](Response.json([{ time: 100, value: 0.003 }]));
	await second;
	expect(await cache.get()).toEqual([{ time: 100, value: 0.003 }]);
});

it('parses reference JSON even for non-ok responses', async () => {
	const fetch = jsonFetch(reference, 500);
	expect(await createVoiUsdReference(fetch).get()).toEqual(reference);
});

it.each([{ body: { error: 'API error' } }, { body: [] }, { body: null }])(
	'does not cache an unusable reference body (%j)',
	async ({ body }) => {
		const fetch = jsonFetch(body);
		const cache = createVoiUsdReference(fetch);
		expect(await cache.get()).toBeNull();
		expect(await cache.get()).toBeNull();
		expect(fetch).toHaveBeenCalledTimes(2);
	}
);

it('propagates reference network/JSON failures and allows retrying', async () => {
	const fetch = vi
		.fn()
		.mockRejectedValueOnce(new Error('offline'))
		.mockResolvedValueOnce(new Response('invalid JSON'))
		.mockResolvedValueOnce(Response.json(reference));
	const cache = createVoiUsdReference(fetch);
	await expect(cache.get()).rejects.toThrow('offline');
	await expect(cache.get()).rejects.toThrow();
	expect(await cache.get()).toEqual(reference);
});

it('skips native VOI in the token fetcher', async () => {
	const fetch = jsonFetch({ candles });
	expect(await fetchTokenChartData(fetch, createVoiUsdReference(fetch).get, 0)).toBeUndefined();
	expect(fetch).not.toHaveBeenCalled();
});

it.each(['USD', 'VOI'] as const)(
	'parses non-ok token responses and ignores JSON error alongside candles (%s)',
	async (quote) => {
		const fetch = jsonFetch({ candles, volumes, error: 'ignored' }, 500);
		const get = vi.fn(async () => null);
		expect(await fetchTokenChartData(fetch, get, 7, '4h', quote)).toEqual({
			data: candles,
			volumes,
			error: ''
		});
		expect(fetch).toHaveBeenCalledWith(
			'/api/ohlcv?baseTokenId=7&quoteTokenId=390001&resolution=4h&limit=240'
		);
		expect(get).toHaveBeenCalledTimes(quote === 'USD' ? 1 : 0);
	}
);

it.each(['USD', 'VOI'] as const)(
	'treats a token JSON error as absent candles (%s)',
	async (quote) => {
		const fetch = jsonFetch({ error: 'ignored' });
		expect(await fetchTokenChartData(fetch, async () => null, 7, '1h', quote)).toEqual({
			error: 'No chart data available for this token'
		});
		expect(fetch).toHaveBeenCalledTimes(quote === 'VOI' ? 2 : 1);
	}
);

it('falls back to native VOI candles and parses a non-ok fallback body', async () => {
	const fetch = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ error: 'ignored' }))
		.mockResolvedValueOnce(Response.json({ candles }, { status: 500 }));
	expect(await fetchTokenChartData(fetch, async () => null, 7, '1h', 'VOI')).toEqual({
		data: candles,
		volumes: [],
		error: ''
	});
	expect(fetch).toHaveBeenLastCalledWith(
		'/api/ohlcv?baseTokenId=7&quoteTokenId=0&resolution=1h&limit=240'
	);
});

it('converts token candles and volumes using the reference data', async () => {
	const fetch = jsonFetch({ candles, volumes });
	const result = await fetchTokenChartData(fetch, async () => reference, 7);
	expect(result).toEqual({
		data: [{ time: 100, open: 0.004, high: 0.008, low: 0.002, close: 0.006, volume: 5 }],
		volumes: [{ time: 100, value: 0.02, color: undefined }],
		error: ''
	});
});

it('turns a token network error or a reference rejection into the existing generic error', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	const error = new Error('offline');
	const failed = vi.fn(async (): Promise<Response> => {
		throw error;
	});
	expect(await fetchTokenChartData(failed, async () => null, 7)).toEqual({
		error: 'Failed to load chart data'
	});
	expect(log).toHaveBeenCalledWith('Error fetching token chart data:', error);
	expect(
		await fetchTokenChartData(
			jsonFetch({ candles }),
			async () => {
				throw error;
			},
			7
		)
	).toEqual({ error: 'Failed to load chart data' });
});

it('parses a non-ok VOI response and returns candles without currency conversion', async () => {
	const fetch = jsonFetch({ candles, volumes }, 500);
	expect(await fetchVOIChartData(fetch, '1h', 'VOI')).toEqual({
		data: candles,
		volumes,
		error: ''
	});
	expect(fetch).toHaveBeenCalledWith(
		'/api/ohlcv?baseTokenId=0&quoteTokenId=302190&resolution=1h&limit=240'
	);
});

it('treats a VOI JSON error as a failure even alongside candles', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	const fetch = jsonFetch({ candles, error: 'API error' });
	expect(await fetchVOIChartData(fetch)).toEqual({ error: 'Failed to load VOI chart data' });
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(log).toHaveBeenCalledWith(
		'Error fetching VOI chart data:',
		expect.objectContaining({ message: 'API error' })
	);
});

it('returns the existing generic error for a VOI network failure', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	const error = new Error('offline');
	const fetch = vi.fn(async (): Promise<Response> => {
		throw error;
	});
	expect(await fetchVOIChartData(fetch)).toEqual({ error: 'Failed to load VOI chart data' });
	expect(log).toHaveBeenCalledWith('Error fetching VOI chart data:', error);
});

it.each(['1h', '4h', '1d'] as const)(
	'falls back to VOI history with the existing period and timestamp mapping (%s)',
	async (resolution) => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ candles: [] }))
			.mockResolvedValueOnce(
				Response.json(
					[
						{ time: 100, value: 2 },
						{ time: '200', value: 3 },
						{ time: '1970-01-01T00:05:00Z', value: 4 }
					],
					{ status: 500 }
				)
			);
		expect(await fetchVOIChartData(fetch, resolution)).toEqual({
			data: [100, 200, 300].map((time, i) => ({
				time,
				open: i + 2,
				high: i + 2,
				low: i + 2,
				close: i + 2,
				volume: 0
			})),
			volumes: [],
			error: ''
		});
		expect(fetch).toHaveBeenLastCalledWith(
			`/api/price-history?period=${resolution === '1h' ? '24h' : '7d'}&token=VOI`
		);
	}
);

it('treats a VOI fallback JSON error as no data', async () => {
	const fetch = jsonFetch({ error: '' });
	fetch
		.mockResolvedValueOnce(Response.json({ candles: [] }))
		.mockResolvedValueOnce(Response.json({ error: 'ignored' }));
	expect(await fetchVOIChartData(fetch)).toEqual({ error: 'No chart data available for VOI' });
});
