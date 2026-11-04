import { beforeEach, describe, expect, it, vi } from 'vitest';

// TASK-142: /api/ohlcv returns one candle per bucket time, and limit counts buckets, not rows.
const state = vi.hoisted(() => ({
	rows: [] as Record<string, unknown>[],
	ranges: [] as number[][],
	repeatBoundaryRow: false
}));

vi.mock('$lib/mimir', () => {
	const builder: Record<string, unknown> = {};
	let from = 0;
	let to = Number.MAX_SAFE_INTEGER;
	let ascending = true;
	let ordered = false;
	for (const name of ['select', 'in', 'eq', 'gte', 'lt', 'abortSignal']) {
		builder[name] = () => builder;
	}
	builder.order = (_col: string, opts?: { ascending?: boolean }) => {
		// only the first key sets the direction; later keys are tie-breakers
		if (!ordered) ascending = opts?.ascending ?? true;
		ordered = true;
		return builder;
	};
	builder.limit = (n: number) => {
		to = from + n - 1;
		return builder;
	};
	builder.range = (a: number, b: number) => {
		from = a;
		to = b;
		state.ranges.push([a, b]);
		return builder;
	};
	builder.then = (resolve: (v: unknown) => unknown) => {
		const sorted = [...state.rows].sort((a, b) =>
			ascending
				? String(a.bucket_start).localeCompare(String(b.bucket_start))
				: String(b.bucket_start).localeCompare(String(a.bucket_start))
		);
		const data = sorted.slice(from, to + 1);
		// a row inserted mid-read shifts the offset: the next page repeats the previous page's last row
		if (state.repeatBoundaryRow && from > 0) data.unshift(sorted[from - 1]);
		from = 0;
		to = Number.MAX_SAFE_INTEGER;
		ordered = false;
		return Promise.resolve({ data, error: null }).then(resolve);
	};
	return { mimirClient: { from: () => builder } };
});

import { GET } from '../../routes/api/ohlcv/+server';

const BASE = Date.UTC(2026, 10, 4, 0, 0, 0);

function row(bucket: number, baseId: number, volume: number) {
	return {
		base_token_id: baseId,
		quote_token_id: 302190,
		resolution: '1h',
		bucket_start: new Date(BASE + bucket * 3600_000).toISOString(),
		open: '1',
		high: '2',
		low: '0.5',
		close: '1.5',
		volume_base: '1',
		volume_quote: String(volume),
		trades_count: 1
	};
}

async function call(query: string) {
	const res = await GET({ url: new URL(`http://x/api/ohlcv?${query}`) } as never);
	return (await res.json()) as {
		count: number;
		candles: { time: number; volume: number }[];
		volumes: { time: number; value: number }[];
	};
}

beforeEach(() => {
	state.rows = [];
	state.ranges = [];
	state.repeatBoundaryRow = false;
});

describe('/api/ohlcv', () => {
	it('returns one candle for two rows of one bucket and the same time in volumes', async () => {
		state.rows = [row(0, 0, 1.916832), row(0, 390001, 0.019637)];
		const body = await call('baseTokenId=0&quote=USD&resolution=1h&limit=5');
		expect(body.count).toBe(1);
		expect(body.candles).toHaveLength(1);
		expect(body.candles[0].volume).toBeCloseTo(1.936469, 9);
		expect(body.volumes).toEqual([
			expect.objectContaining({ time: body.candles[0].time, value: body.candles[0].volume })
		]);
	});

	it('leaves a one-row-per-bucket response unchanged', async () => {
		state.rows = [row(0, 0, 1), row(1, 0, 2), row(2, 0, 3)];
		const body = await call('baseTokenId=0&quote=USD&resolution=1h&limit=10');
		expect(body.candles.map((c) => c.volume)).toEqual([1, 2, 3]);
	});

	it('counts buckets, not rows, against limit', async () => {
		state.rows = [0, 1, 2, 3].flatMap((b) => [row(b, 0, 1), row(b, 390001, 1)]);
		const body = await call('baseTokenId=0&quote=USD&resolution=1h&limit=3');
		expect(body.count).toBe(3);
		expect(body.candles.map((c) => c.volume)).toEqual([2, 2, 2]);
		// the newest three buckets (1, 2, 3), ascending
		expect(body.candles.map((c) => c.time)).toEqual(
			[1, 2, 3].map((b) => (BASE + b * 3600_000) / 1000)
		);
	});

	it('never splits a bucket across a page boundary', async () => {
		// 700 buckets x 2 rows = 1400 rows, more than one page
		state.rows = Array.from({ length: 700 }, (_, b) => [row(b, 0, 1), row(b, 390001, 1)]).flat();
		const body = await call(
			'baseTokenId=0&quote=USD&resolution=1h&limit=700&start=1&end=9999999999'
		);
		expect(body.count).toBe(700);
		expect(body.candles.every((c) => c.volume === 2)).toBe(true);
		expect(state.ranges.length).toBeGreaterThan(1);
	});

	it('counts a row once when a page repeats the previous page boundary row', async () => {
		state.repeatBoundaryRow = true;
		state.rows = Array.from({ length: 700 }, (_, b) => [row(b, 0, 1), row(b, 390001, 1)]).flat();
		const body = await call(
			'baseTokenId=0&quote=USD&resolution=1h&limit=700&start=1&end=9999999999'
		);
		expect(body.count).toBe(700);
		expect(body.candles.every((c) => c.volume === 2)).toBe(true);
	});
});
