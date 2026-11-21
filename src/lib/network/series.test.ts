import { describe, expect, it } from 'vitest';
import epochs from './fixtures/epochs.json';
import stake from './fixtures/online-stake-history.json';
import prices from './fixtures/price-history-7d.json';
import transactions from './fixtures/tx-counts-day-30.json';
import { stakeSeries, priceSeries, transactionSeries } from './series';
import { epochSeries } from '$lib/epochRewards/analytics/series';

const now = Date.parse('2026-11-06T02:55:00Z');

it('converts a recorded daily stake row from micro-VOI and preserves missing UTC dates', () => {
	const result = stakeSeries(
		stake.filter((r) => r.date !== '2026-10-09'),
		undefined,
		now
	);
	expect(result.rows).toHaveLength(30);
	expect(result.rows[0]).toEqual({ date: '2026-10-08', value: 476303289.6107671 });
	expect(result.rows[1]).toEqual({ date: '2026-10-09', value: null });
	expect(result.rows.at(-1)?.date).toBe('2026-11-06');
	expect(result.asOf).toEqual({ kind: 'observed', time: Date.parse(stake.at(-1)!.max_timestamp) });
});

it('falls back to the retrieval time when no stake row carries a source observation time', () => {
	const result = stakeSeries(
		stake.map((row) => ({ ...row, max_timestamp: undefined })),
		undefined,
		now
	);
	expect(result.status).toBe('ready');
	expect(result.asOf).toEqual({ kind: 'retrieved', time: now });
});

it('does not coerce missing or invalid stake into zero', () => {
	for (const value of [null, undefined, NaN, Infinity, -1]) {
		const result = stakeSeries([{ ...stake.at(-1), avg_online_stake: value }], undefined, now);
		expect(result.status).toBe('empty');
		expect(result.rows.every((r) => r.value === null)).toBe(true);
	}
});

it('normalises a recorded seconds price timestamp', () => {
	const row = prices[0];
	const result = priceSeries([row], undefined, now);
	expect(
		result.rows.find((r) => r.date === new Date(row.time * 1000).toISOString().slice(0, 10))?.value
	).toBe(row.value);
	expect(result.asOf.time).toBe(row.time * 1000);
});
it('normalises millisecond price timestamps', () => {
	const row = prices[0];
	expect(priceSeries([{ ...row, time: row.time * 1000 }], undefined, now).asOf.time).toBe(
		row.time * 1000
	);
});
it('normalises ISO price timestamps into UTC days', () => {
	const result = priceSeries([{ time: '2026-11-05T23:30:00-02:00', value: 0.001 }], undefined, now);
	expect(result.rows.at(-1)).toEqual({ date: '2026-11-06', value: 0.001 });
	expect(result.asOf.time).toBe(Date.parse('2026-11-06T01:30:00Z'));
});

it('averages only finite positive prices and leaves missing or nonpositive days as gaps', () => {
	const result = priceSeries(
		[
			{ time: '2026-11-04T01:00:00Z', value: 0.001 },
			{ time: '2026-11-04T02:00:00Z', value: 0.003 },
			...[-1, 0, NaN, Infinity, null, undefined].map((value) => ({
				time: '2026-11-04T03:00:00Z',
				value
			})),
			{ time: '2026-11-05T03:00:00Z', value: 0 },
			{ time: 'invalid', value: 1 }
		],
		undefined,
		now
	);
	expect(result.rows.find((r) => r.date === '2026-11-04')?.value).toBe(0.002);
	expect(result.rows.find((r) => r.date === '2026-11-05')?.value).toBeNull();
	expect(result.rows.at(-1)?.value).toBeNull();
	expect(priceSeries([{ time: prices[0].time, value: 0 }], undefined, now).status).toBe('empty');
});

it('retains real zero transactions and separates actual and projected daily totals', () => {
	const result = transactionSeries(
		{
			data: [
				...transactions.data.slice(0, -1),
				{ bucket_start: '2026-11-06T00:00:00', tx_count: 0 }
			]
		},
		undefined,
		now,
		'day'
	);
	expect(result.status).toBe('ready');
	expect(result.rows.at(-1)).toEqual({ date: '2026-11-06', actual: 0, projected: 0 });
	const projected = transactionSeries(
		transactions,
		undefined,
		Date.parse('2026-11-06T12:00:00Z'),
		'day'
	);
	expect(projected.rows.at(-1)).toMatchObject({ actual: 690, projected: 1380 });
	expect(projected.rows[0].projected).toBeNull();
});

it('separates actual and projected weekly totals with Monday UTC boundaries', () => {
	const result = transactionSeries(
		{ data: [{ bucket_start: '2026-11-02T00:00:00', tx_count: 100 }] },
		undefined,
		Date.parse('2026-11-05T12:00:00Z'),
		'week'
	);
	expect(result.rows[0]).toEqual({ date: '2026-11-02', actual: 100, projected: 200 });
});

it('keeps a bucket the source skipped as an unavailable row, never zero and never dropped', () => {
	const daily = transactionSeries(
		{
			data: [
				{ bucket_start: '2026-11-01T00:00:00', tx_count: 10 },
				{ bucket_start: '2026-11-03T00:00:00', tx_count: 30 }
			]
		},
		undefined,
		Date.parse('2026-11-10T00:00:00Z'),
		'day'
	);
	expect(daily.rows.map((row) => [row.date, row.actual])).toEqual([
		['2026-11-01', 10],
		['2026-11-02', null],
		['2026-11-03', 30]
	]);
	const weekly = transactionSeries(
		{
			data: [
				{ bucket_start: '2026-10-19T00:00:00', tx_count: 1 },
				{ bucket_start: '2026-11-02T00:00:00', tx_count: 3 }
			]
		},
		undefined,
		Date.parse('2026-11-20T00:00:00Z'),
		'week'
	);
	expect(weekly.rows.map((row) => row.actual)).toEqual([1, null, 3]);
});

it('keeps buckets that are off the expected grid instead of dropping them', () => {
	const result = transactionSeries(
		{
			data: [
				{ bucket_start: '2026-11-02T00:00:00', tx_count: 1 },
				{ bucket_start: '2026-11-05T00:00:00', tx_count: 2 }
			]
		},
		undefined,
		Date.parse('2026-11-20T00:00:00Z'),
		'week'
	);
	expect(result.rows.map((row) => row.actual)).toEqual([1, 2]);
});

it('rejects invalid transaction counts instead of creating zero buckets', () => {
	const result = transactionSeries(
		{
			data: [
				null,
				{ bucket_start: 'bad', tx_count: 1 },
				...[null, undefined, -1, NaN, Infinity].map((tx_count) => ({
					bucket_start: '2026-11-06T00:00:00',
					tx_count
				}))
			]
		},
		undefined,
		now,
		'day'
	);
	expect(result.status).toBe('empty');
	expect(result.rows).toEqual([]);
});

describe.each([
	[
		'epochs',
		(input: unknown, prior?: ReturnType<typeof epochSeries>, at = now) =>
			epochSeries(input, prior, at),
		epochs,
		{ epochs: [] }
	],
	[
		'stake',
		(input: unknown, prior?: ReturnType<typeof stakeSeries>, at = now) =>
			stakeSeries(input, prior, at),
		stake,
		[]
	],
	[
		'price',
		(input: unknown, prior?: ReturnType<typeof priceSeries>, at = now) =>
			priceSeries(input, prior, at),
		prices,
		[]
	],
	[
		'transactions',
		(input: unknown, prior?: ReturnType<typeof transactionSeries>, at = now) =>
			transactionSeries(input, prior, at, 'day'),
		transactions,
		{ data: [] }
	]
] as const)('%s resource', (_name, convert, fixture, empty) => {
	it('retains original receipt, coverage, observation time and rows after failure', () => {
		const good = convert(fixture);
		const failed = convert(null, good as never, now + 60000);
		expect(failed).toEqual({ ...good, status: 'stale' });
		expect(failed.rows).toBe(good.rows);
	});
	it('distinguishes failure without prior data from a successful empty response', () => {
		expect(convert(null).status).toBe('error');
		expect(convert({ error: 'unavailable' }).status).toBe('error');
		expect(convert(empty).status).toBe('empty');
	});
});

it.each(['stake', 'price'] as const)(
	'treats a gap-only %s result as unavailable after a failed refresh',
	(kind) => {
		const convert = kind === 'stake' ? stakeSeries : priceSeries;
		const empty = convert(
			kind === 'stake' ? [] : [{ time: prices[0].time, value: 0 }],
			undefined,
			now
		);
		expect(empty.status).toBe('empty');
		expect(empty.rows.length).toBeGreaterThan(0);
		const failed = convert(null, empty, now + 60_000);
		expect(failed.status).toBe('error');
		expect(failed.receivedAt).toBeNull();
	}
);
