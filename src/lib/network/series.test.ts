import { describe, expect, it } from 'vitest';
import epochs from './fixtures/epochs.json';
import stake from './fixtures/online-stake-history.json';
import prices from './fixtures/price-history-7d.json';
import transactions from './fixtures/tx-counts-day-30.json';
import {
	epochSeries,
	epochRange,
	stakeSplit,
	stakeSeries,
	priceSeries,
	transactionSeries
} from './series';

const now = Date.parse('2026-11-06T02:55:00Z');

it('sorts all fetched epochs without mutation and slices 12, 26 and All locally', () => {
	const input = { ...epochs, epochs: [...epochs.epochs].reverse() };
	const original = structuredClone(input);
	const result = epochSeries(input, undefined, now);
	expect(input).toEqual(original);
	expect(result.status).toBe('ready');
	expect(result.rows.map((r) => r.epoch)).toEqual(epochs.epochs.map((r) => r.epoch_number));
	expect(epochRange(result.rows, '12')).toHaveLength(12);
	expect(epochRange(result.rows, '26')).toHaveLength(26);
	expect(epochRange(result.rows, 'all')).toHaveLength(106);
	expect(result.current).toMatchObject({ epoch: 106, inProgress: true });
	expect(result.previous).toMatchObject({ epoch: 105, inProgress: false });
	expect(result.asOf).toEqual({ kind: 'retrieved', time: now });
	expect(result.coverage).toBe('Epochs 1–106');
});

it('keeps missing, non-finite and negative epoch metrics unavailable', () => {
	const result = epochSeries(
		{
			current_epoch: 3,
			epochs: [
				{ ...epochs.epochs[0], epoch_number: 1, participating_wallets: undefined, apr: Infinity },
				{ ...epochs.epochs[0], epoch_number: 2, participating_wallets: NaN },
				{ ...epochs.epochs[0], epoch_number: 3, participating_wallets: -1, apr: null },
				{ ...epochs.epochs[0], epoch_number: NaN }
			]
		},
		undefined,
		now
	);
	expect(result.rows).toHaveLength(3);
	expect(result.rows.map((r) => r.accounts)).toEqual([null, null, null]);
	expect(result.rows.map((r) => r.apr)).toEqual([null, epochs.epochs[0].apr, null]);
});

it('returns the previous completed epoch even when the source is shuffled or incomplete', () => {
	const result = epochSeries(
		{ current_epoch: 106, epochs: [epochs.epochs[105], epochs.epochs[103]] },
		undefined,
		now
	);
	expect(result.previous?.epoch).toBe(104);
});

it.each([undefined, null, NaN, 'soon'])(
	'names no completed or in-progress epoch when current_epoch is unusable: %j',
	(current_epoch) => {
		const result = epochSeries({ current_epoch, epochs: epochs.epochs.slice(-3) }, undefined, now);
		expect(result.rows).toHaveLength(3);
		expect(result.current).toBeNull();
		expect(result.previous).toBeNull();
		expect(result.rows.some((row) => row.inProgress)).toBe(false);
	}
);

it('derives the community, ballast and eligible split in VOI', () => {
	const row = epochs.epochs[0];
	expect(stakeSplit(row)).toEqual({
		online: row.online_stake,
		community: row.online_stake - row.ballast_stake,
		ballast: row.ballast_stake,
		eligible: row.eligible_online_stake
	});
	expect(stakeSplit(epochs.epochs[105])?.ballast).toBe(0);
});

it.each([
	{ online_stake: 0 },
	{ online_stake: -1 },
	{ ballast_stake: -1 },
	{ eligible_online_stake: -1 },
	{ ballast_stake: 2e9 },
	{ eligible_online_stake: 2e9 },
	{ online_stake: Infinity },
	{ ballast_stake: null },
	{ eligible_online_stake: undefined }
])('rejects an unavailable or impossible stake split: %j', (invalid) => {
	expect(stakeSplit({ ...epochs.epochs[0], ...invalid })).toBeNull();
});

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

it('a price failure leaves the independently derived APR result ready', () => {
	const apr = epochSeries(epochs, undefined, now);
	expect(priceSeries(null, undefined, now).status).toBe('error');
	expect(apr.status).toBe('ready');
	expect(apr.current?.apr).toBe(epochs.epochs.at(-1)!.apr);
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
