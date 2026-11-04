import { describe, expect, it } from 'vitest';
import { mergeCandleRows } from './ohlcvMerge';
import type { PriceCandle } from '$lib/types/ohlcv.types';

// TASK-142: equivalent token ids (VOI 0/390001, aUSDC 302190/395614) can each carry a row for one bucket.
function row(over: Partial<PriceCandle> & { bucket_start: string }): PriceCandle {
	return {
		base_token_id: 0,
		quote_token_id: 302190,
		resolution: '1h',
		open: '1',
		high: '1',
		low: '1',
		close: '1',
		volume_base: '0',
		volume_quote: '0',
		trades_count: 1,
		...over
	};
}

const T = '2026-11-04T09:00:00+00:00';
const T_SEC = Math.floor(new Date(T).getTime() / 1000);

describe('mergeCandleRows', () => {
	it('keeps a single row per bucket unchanged', () => {
		const out = mergeCandleRows([
			row({
				bucket_start: T,
				open: '0.5',
				high: '0.7',
				low: '0.4',
				close: '0.6',
				volume_quote: '3'
			})
		]);
		expect(out).toEqual([{ time: T_SEC, open: 0.5, high: 0.7, low: 0.4, close: 0.6, volume: 3 }]);
	});

	it('merges two rows of one bucket even when the lower-volume row comes last', () => {
		const out = mergeCandleRows([
			row({
				bucket_start: T,
				base_token_id: 0,
				open: '0.010',
				high: '0.013',
				low: '0.009',
				close: '0.012',
				volume_quote: '1.916832'
			}),
			row({
				bucket_start: T,
				base_token_id: 390001,
				open: '0.020',
				high: '0.021',
				low: '0.019',
				close: '0.0205',
				volume_quote: '0.019637'
			})
		]);
		expect(out).toHaveLength(1);
		expect(out[0].time).toBe(T_SEC);
		expect(out[0].high).toBe(0.021);
		expect(out[0].low).toBe(0.009);
		expect(out[0].volume).toBeCloseTo(1.936469, 9);
		// open and close come from the largest-quote-volume row, not the last row
		expect(out[0].open).toBe(0.01);
		expect(out[0].close).toBe(0.012);
	});

	it('is independent of the order of the rows within a bucket', () => {
		const a = row({ bucket_start: T, base_token_id: 0, open: '2', close: '3', volume_quote: '5' });
		const b = row({
			bucket_start: T,
			base_token_id: 390001,
			open: '7',
			close: '8',
			volume_quote: '1'
		});
		expect(mergeCandleRows([a, b])).toEqual(mergeCandleRows([b, a]));
	});

	it('breaks a volume tie by the lower base token id so the result is stable', () => {
		const a = row({
			bucket_start: T,
			base_token_id: 390001,
			open: '7',
			close: '8',
			volume_quote: '2'
		});
		const b = row({ bucket_start: T, base_token_id: 0, open: '2', close: '3', volume_quote: '2' });
		const out = mergeCandleRows([a, b]);
		expect(out[0].open).toBe(2);
		expect(out[0].close).toBe(3);
		expect(mergeCandleRows([b, a])).toEqual(out);
	});

	it('returns one candle per bucket, ascending by time, across several buckets', () => {
		const t2 = '2026-11-04T10:00:00+00:00';
		const out = mergeCandleRows([
			row({ bucket_start: T, volume_quote: '1' }),
			row({ bucket_start: t2, volume_quote: '2' }),
			row({ bucket_start: t2, base_token_id: 390001, volume_quote: '4' })
		]);
		expect(out.map((c) => c.time)).toEqual([T_SEC, T_SEC + 3600]);
		expect(out.map((c) => c.volume)).toEqual([1, 6]);
	});

	it('merges four rows (both base and quote equivalents)', () => {
		const out = mergeCandleRows([
			row({
				bucket_start: T,
				base_token_id: 0,
				quote_token_id: 302190,
				high: '5',
				low: '4',
				volume_quote: '1'
			}),
			row({
				bucket_start: T,
				base_token_id: 0,
				quote_token_id: 395614,
				high: '9',
				low: '4',
				volume_quote: '1'
			}),
			row({
				bucket_start: T,
				base_token_id: 390001,
				quote_token_id: 302190,
				high: '5',
				low: '2',
				volume_quote: '1'
			}),
			row({
				bucket_start: T,
				base_token_id: 390001,
				quote_token_id: 395614,
				high: '5',
				low: '4',
				volume_quote: '1'
			})
		]);
		expect(out).toHaveLength(1);
		expect(out[0].high).toBe(9);
		expect(out[0].low).toBe(2);
		expect(out[0].volume).toBe(4);
	});
});
