import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	clampCandlesByMAD,
	clampOutliersMAD,
	convertVoiQuotedCandlesToUsd,
	convertVoiQuotedVolumesToUsd,
	type VoiUsdPoint
} from './price-conversion.ts';

const candle = (time: number, open = 10) => ({
	time,
	open,
	high: open + 2,
	low: open - 2,
	close: open + 1,
	volume: 100
});

const usdPoints: VoiUsdPoint[] = [
	{ time: 300, value: 4 },
	{ time: '1970-01-01T00:01:40Z', value: 2 },
	{ time: '200', value: 3 },
	{ time: 'invalid', value: 99 },
	{ time: 150, value: NaN }
];

test('candles use the matching or latest preceding USD point, with the earliest as fallback', () => {
	const candles = [310, 190, 50, 200].map((time) => candle(time));
	assert.deepEqual(convertVoiQuotedCandlesToUsd(candles, usdPoints), [
		{ time: 50, open: 20, high: 24, low: 16, close: 22, volume: 100 },
		{ time: 190, open: 20, high: 24, low: 16, close: 22, volume: 100 },
		{ time: 200, open: 30, high: 36, low: 24, close: 33, volume: 100 },
		{ time: 310, open: 40, high: 48, low: 32, close: 44, volume: 100 }
	]);
});

test('volumes use the matching or latest preceding USD point and preserve colors', () => {
	const volumes = [310, 190, 50, 200].map((time) => ({ time, value: 10, color: 'green' }));
	assert.deepEqual(convertVoiQuotedVolumesToUsd(volumes, usdPoints), [
		{ time: 50, value: 20, color: 'green' },
		{ time: 190, value: 20, color: 'green' },
		{ time: 200, value: 30, color: 'green' },
		{ time: 310, value: 40, color: 'green' }
	]);
});

test('all four helpers accept empty input', () => {
	assert.deepEqual(convertVoiQuotedCandlesToUsd([], usdPoints), []);
	assert.deepEqual(convertVoiQuotedVolumesToUsd([], usdPoints), []);
	assert.deepEqual(clampCandlesByMAD([]), []);
	assert.deepEqual(clampOutliersMAD([]), []);
});

test('candles stay unchanged when USD points are missing or all invalid', () => {
	const candles = [candle(100)];
	assert.deepEqual(convertVoiQuotedCandlesToUsd(candles, []), candles);
	assert.deepEqual(
		convertVoiQuotedCandlesToUsd(candles, [
			{ time: 'invalid', value: 2 },
			{ time: 100, value: NaN }
		]),
		candles
	);
});

test('volumes stay unchanged when USD points are missing or all invalid', () => {
	const volumes = [{ time: 100, value: 10 }];
	assert.deepEqual(convertVoiQuotedVolumesToUsd(volumes, []), volumes);
	assert.deepEqual(
		convertVoiQuotedVolumesToUsd(volumes, [
			{ time: 'invalid', value: 2 },
			{ time: 100, value: NaN }
		]),
		volumes
	);
});

test('MAD leaves normal values unchanged', () => {
	assert.deepEqual(clampOutliersMAD([9, 10, 11, 12, 13]), [9, 10, 11, 12, 13]);
});

test('MAD clamps a single extreme value with the default k', () => {
	assert.deepEqual(clampOutliersMAD([9, 10, 11, 12, 1000]), [9, 10, 11, 12, 19.8956]);
});

test('MAD honors k at both the lower and upper limits', () => {
	assert.deepEqual(clampOutliersMAD([9, 10, 11, 12, 1000], 1), [9.5174, 10, 11, 12, 12.4826]);
});

test('zero MAD leaves the values unchanged even with an extreme value', () => {
	assert.deepEqual(clampOutliersMAD([10, 10, 10, 10, 1000]), [10, 10, 10, 10, 1000]);
});

test('candle MAD leaves normal OHLC values unchanged', () => {
	const candles = [9, 10, 11, 12, 13].map((value, time) => candle(time, value));
	assert.deepEqual(clampCandlesByMAD(candles), candles);
});

test('candle MAD clamps each OHLC field of a single extreme candle', () => {
	const candles = [9, 10, 11, 12, 1000].map((value, time) => candle(time, value));
	assert.deepEqual(clampCandlesByMAD(candles), [
		...candles.slice(0, 4),
		{ time: 4, open: 19.8956, high: 21.8956, low: 17.8956, close: 20.8956, volume: 100 }
	]);
});

test('candle MAD forwards k to all four fields and preserves time and volume', () => {
	const candles = [9, 10, 11, 12, 1000].map((value, time) => candle(time, value));
	assert.deepEqual(
		clampCandlesByMAD(candles, 0),
		candles.map(({ time, volume }) => ({ time, open: 11, high: 13, low: 9, close: 12, volume }))
	);
});
