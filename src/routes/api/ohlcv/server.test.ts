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
	limit: vi.fn().mockReturnThis(),
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

it('queries the newest candles before applying the requested limit', async () => {
	await request('&limit=3');
	expect(query.order).toHaveBeenCalledWith('bucket_start', { ascending: false });
	expect(query.limit).toHaveBeenCalledWith(3);
	expect(query.order.mock.invocationCallOrder[0]).toBeLessThan(
		query.limit.mock.invocationCallOrder[0]
	);
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

it.each([
	{ params: '&limit=3000', expected: 2000 },
	{ params: '', expected: 500 }
])('preserves the limit clamp and default ($params → $expected)', async ({ params, expected }) => {
	await request(params);
	expect(query.limit).toHaveBeenCalledWith(expected);
});

it('returns the existing 500 error response when MIMIR fails', async () => {
	error = { message: 'upstream failed' };
	const response = await request();
	expect(response.status).toBe(500);
	expect(await response.json()).toEqual({
		error: 'Failed to fetch OHLCV data: upstream failed'
	});
});
