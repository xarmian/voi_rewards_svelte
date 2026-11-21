import { expect, it } from 'vitest';
import epochs from '$lib/network/fixtures/epochs.json';
import { priceSeries } from '$lib/network/series';
import { epochSeries, epochRange, stakeSplit } from './series';

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
		expect(result.rows.every((row) => row.status === 'unavailable')).toBe(true);
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

it('labels each epoch in progress or completed against a valid current epoch', () => {
	const result = epochSeries(
		{ current_epoch: 106, epochs: epochs.epochs.slice(-3) },
		undefined,
		now
	);
	expect(result.rows.map((row) => row.status)).toEqual(['completed', 'completed', 'in progress']);
});

it('keeps an epoch number the source skipped as a row with no figures', () => {
	const result = epochSeries(
		{ current_epoch: 106, epochs: [epochs.epochs[102], epochs.epochs[105]] },
		undefined,
		now
	);
	expect(result.rows.map((row) => [row.epoch, row.apr === null])).toEqual([
		[103, false],
		[104, true],
		[105, true],
		[106, false]
	]);
	expect(result.rows.map((row) => row.status)).toEqual([
		'completed',
		'unavailable',
		'unavailable',
		'in progress'
	]);
	expect(result.rows[1].accounts).toBeNull();
	expect(result.previous?.epoch).toBe(103);
});

it('a price failure leaves the independently derived APR result ready', () => {
	const apr = epochSeries(epochs, undefined, now);
	expect(priceSeries(null, undefined, now).status).toBe('error');
	expect(apr.status).toBe('ready');
	expect(apr.current?.apr).toBe(epochs.epochs.at(-1)!.apr);
});
