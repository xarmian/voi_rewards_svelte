import { beforeEach, expect, it, vi } from 'vitest';
import type { PriceCandle } from '$lib/types/ohlcv.types';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('$lib/mimir', () => ({ mimirClient: mocks }));

import { GET } from './+server';

let rows: PriceCandle[];
let error: { message: string } | null;

const query = {
	select: vi.fn().mockReturnThis(),
	in: vi.fn().mockReturnThis(),
	eq: vi.fn().mockReturnThis(),
	gte: vi.fn().mockReturnThis(),
	lt: vi.fn().mockReturnThis(),
	order: vi.fn().mockReturnThis(),
	range: vi.fn().mockReturnThis(),
	abortSignal: vi.fn(async () => ({ data: rows, error }))
};

beforeEach(() => {
	vi.clearAllMocks();
	rows = [];
	error = null;
	mocks.from.mockReturnValue(query);
});

function request(params = '') {
	return GET({
		url: new URL(`https://example.test/api/ohlcv?baseTokenId=7&quoteTokenId=390001${params}`)
	} as Parameters<typeof GET>[0]);
}

it('reads the newest rows first, in pages, ordered before the range is applied', async () => {
	await request('&limit=3');
	expect(query.order).toHaveBeenCalledWith('bucket_start', { ascending: false });
	expect(query.range).toHaveBeenCalledWith(0, 999);
	expect(query.order.mock.invocationCallOrder[0]).toBeLessThan(
		query.range.mock.invocationCallOrder[0]
	);
});

it('orders by a total key so offset pages never skip or repeat tied rows', async () => {
	await request('&limit=3');
	// newest first on every key: the handler stops at the first bucket past the limit
	expect(query.order.mock.calls).toEqual([
		['bucket_start', { ascending: false }],
		['base_token_id', { ascending: false }],
		['quote_token_id', { ascending: false }]
	]);
});

it('builds a fresh query for every page', async () => {
	rows = Array.from({ length: 1000 }, (_, i) => ({
		base_token_id: 7,
		quote_token_id: 390001,
		resolution: '1h' as const,
		bucket_start: new Date((5000 - i) * 1000).toISOString(),
		open: '2',
		high: '4',
		low: '1',
		close: '3',
		volume_base: '5',
		volume_quote: '10',
		trades_count: 1
	}));
	await request('&start=1&end=9999999&limit=3000');
	expect(query.range.mock.calls.length).toBeGreaterThan(1);
	expect(mocks.from).toHaveBeenCalledTimes(query.range.mock.calls.length);
});

it('returns newest-first database rows as ascending candles and volumes with the correct count', async () => {
	rows = [300, 200, 100].map((time) => ({
		base_token_id: 7,
		quote_token_id: 390001,
		resolution: '1h',
		bucket_start: new Date(time * 1000).toISOString(),
		open: '2',
		high: '4',
		low: '1',
		close: '3',
		volume_base: '5',
		volume_quote: '10',
		trades_count: 1
	}));

	const response = await request('&start=1&end=400&limit=3');
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		count: 3,
		candles: [100, 200, 300].map((time) => ({
			time,
			open: 2,
			high: 4,
			low: 1,
			close: 3,
			volume: 10
		})),
		volumes: [100, 200, 300].map((time) => ({ time, value: 10, color: '#22c55e' }))
	});
});

// The limit counts buckets (TASK-142); the row-level contract is in src/lib/server/ohlcvRoute.test.ts.
it.each([
	{ params: '&limit=3000', expected: 2000 },
	{ params: '', expected: 500 }
])('preserves the limit clamp and default ($params → $expected)', async ({ params, expected }) => {
	rows = Array.from({ length: 2100 }, (_, i) => ({
		base_token_id: 7,
		quote_token_id: 390001,
		resolution: '1h' as const,
		bucket_start: new Date((2100 - i) * 1000).toISOString(),
		open: '2',
		high: '4',
		low: '1',
		close: '3',
		volume_base: '5',
		volume_quote: '10',
		trades_count: 1
	}));
	const body = await (await request(`&start=1&end=9999999${params}`)).json();
	expect(body.count).toBe(expected);
	expect(body.candles).toHaveLength(expected);
});

it('returns the existing 500 error response when MIMIR fails', async () => {
	error = { message: 'upstream failed' };
	const response = await request();
	expect(response.status).toBe(500);
	expect(await response.json()).toEqual({
		error: 'Failed to fetch OHLCV data: upstream failed'
	});
});
