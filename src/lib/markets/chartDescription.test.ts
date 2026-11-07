import { expect, it } from 'vitest';
import { describeLine, describeOHLCV, displayedByTime } from './chartDescription';

const context = { selection: 'VOI/USD pool', period: '1h', quote: 'USD' };
const candles = [
	{ time: 20, open: 2, high: 5, low: 1, close: 3, volume: 999 },
	{ time: 10, open: 1, high: 4, low: 0.5, close: 2, volume: 888 },
	{ time: 20, open: 3, high: 6, low: 2, close: 4, volume: 777 }
];
it('keeps every line observation in renderer input order, including duplicate timestamps', () => {
	const data = [
		{ time: 20, value: 2 },
		{ time: 10, value: 1 },
		{ time: 20, value: 3 }
	];
	const result = describeLine(data, 'Example pool', '7d');
	expect(result.rows).toEqual([
		['1970-01-01 00:00:20 UTC', '2.000000'],
		['1970-01-01 00:00:10 UTC', '1.000000'],
		['1970-01-01 00:00:20 UTC', '3.000000']
	]);
	expect(result.summary).toContain('Example pool · 7d');
	expect(result.summary).toContain('First price 2.000000');
	expect(result.summary).toContain('last price 3.000000');
	expect(result.summary).toContain('3 observations');
	expect(result.headers).toEqual(['Timestamp (UTC)', 'Price']);
	expect(result.caption).toContain('Quote unit not stated for this fallback chart');
});
it('shares the renderer sort and last-duplicate rule for OHLCV without mutating input', () => {
	const displayed = displayedByTime(candles);
	expect(displayed).toEqual([candles[1], candles[2]]);
	expect(candles.map((p) => p.time)).toEqual([20, 10, 20]);
	const result = describeOHLCV(displayed, [], context);
	expect(result.rows).toEqual([
		['1970-01-01 00:00:10 UTC', '1.000000', '4.000000', '0.500000', '2.000000'],
		['1970-01-01 00:00:20 UTC', '3.000000', '6.000000', '2.000000', '4.000000']
	]);
	for (const text of ['VOI/USD pool', '1h', '2 data points', '00:00:10 UTC', '00:00:20 UTC', 'USD'])
		expect(result.summary).toContain(text);
	expect(result.period).toEqual({
		open: '1.000000',
		high: '6.000000',
		low: '0.500000',
		close: '4.000000',
		volume: '—'
	});
	expect(result.headers).toEqual([
		'Timestamp (UTC)',
		'Open (USD)',
		'High (USD)',
		'Low (USD)',
		'Close (USD)'
	]);
	expect(result.caption).toContain('Prices in USD');
});
it('maps only displayed volume, keeps missing volume missing, and includes volume-only observations', () => {
	const volumes = displayedByTime([
		{ time: 20, value: 0 },
		{ time: 30, value: 8 },
		{ time: 20, value: 7 }
	]);
	const result = describeOHLCV(displayedByTime(candles), volumes, context);
	expect(result.headers.at(-1)).toBe('Volume (USD)');
	expect(result.rows.map((row) => row.at(-1))).toEqual(['—', '7', '8']);
	expect(result.rows[2]).toEqual(['1970-01-01 00:00:30 UTC', '—', '—', '—', '—', '8']);
	expect(result.period.volume).toBe('15');
	expect(result.caption).toContain('volume in USD');
});
it('preserves missing values and real zero values without synthesizing zeros', () => {
	const line = describeLine(
		[
			{ time: 1, value: undefined },
			{ time: 2, value: 0 }
		],
		'Selection',
		'24h'
	);
	expect(line.rows.map((row) => row[1])).toEqual(['—', '0.000000']);
	const result = describeOHLCV(
		[{ time: 1, open: null, high: undefined, low: NaN, close: 0 }],
		[{ time: 1, value: undefined }],
		context
	);
	expect(result.rows[0].slice(1)).toEqual(['—', '—', '—', '0.000000', '—']);
	expect(result.period.volume).toBe('—');
});
it('describes empty arrays without invented endpoints or numbers', () => {
	for (const result of [describeLine([], 'Selection', '24h'), describeOHLCV([], [], context)]) {
		expect(result.rows).toEqual([]);
		expect(result.summary).toContain('No observations');
		expect(result.summary).not.toContain('0.000000');
	}
});
it('formats calendar timestamps as UTC without changing the observations', () => {
	expect(
		describeLine([{ time: { year: 2026, month: 11, day: 7 }, value: 2 }], 'Selection', '24h')
			.rows[0][0]
	).toBe('2026-11-07 00:00:00 UTC');
	expect(describeLine([{ time: '2026-11-07', value: 2 }], 'Selection', '24h').rows[0][0]).toBe(
		'2026-11-07 00:00:00 UTC'
	);
});
