import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { epochRange } from '$lib/epochs';
import { REWARDS_ADDRESSES } from '$lib/rewards/calculateEpochRewards';
import {
	validatePayouts,
	mergeRewardRows,
	cumulativePayouts,
	dailyProposals,
	completedEpoch,
	liveEpoch,
	loadPayouts,
	loadRewardEpochs,
	loadDailyProposals,
	loadEligibleStakes,
	type RewardEpoch
} from './rewards';
import { createReadSource, type Source } from './read';
vi.mock('$lib/utils', () => ({ getTokensByEpoch: vi.fn(async () => 1400) }));
vi.mock('$lib/stores/accounts', () => ({
	getSupplyInfo: vi.fn(),
	requireAccountInfo: vi.fn(),
	onlineStakeStore: { getData: vi.fn(), refresh: vi.fn() }
}));
vi.mock('../../stores/dataTable', () => ({
	dataTable: { fetchDateRanges: vi.fn(), fetchData: vi.fn() }
}));
import { dataTable } from '../../stores/dataTable';
const address = 'PAGE';
const now = epochRange(66).start.getTime();
const epoch: RewardEpoch = {
	epoch: 62,
	blocks: 12,
	networkBlocks: 120,
	estimate: 140,
	current: false
};
const tx = (txid = 'one', amount = 2_000_000, timestamp = epochRange(63).start.toISOString()) => ({
	txid,
	amount,
	tx_timestamp: timestamp
});
const ready = <T>(value: T): Source<T> => ({ state: 'ready', value, asOf: now });
const payments = (...records: ReturnType<typeof tx>[]) => ready(validatePayouts(records));
const rows = (payouts: Source<ReturnType<typeof validatePayouts>>, epochs = [epoch], at = now) =>
	mergeRewardRows(epochs, payouts, at);
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
it('distinguishes payout failure from a complete empty result', () => {
	expect(rows({ state: 'error', error: 'offline' })[0]).toMatchObject({
		status: 'Unavailable',
		actual: null,
		estimate: 140
	});
	expect(rows(payments())[0]).toMatchObject({
		status: 'Not found',
		actual: null,
		explanation: 'No payment found in the following week.',
		tone: 'warn'
	});
});
it('keeps recorded zero payments distinct from absence and estimates', () => {
	expect(rows(payments(tx('zero', 0)))[0]).toMatchObject({
		status: 'Paid',
		actual: 0,
		estimate: 140
	});
	expect(cumulativePayouts(validatePayouts([tx('zero', 0)]))).toEqual([
		expect.objectContaining({ amount: 0, running: 0 })
	]);
});
it('switches Pending to Not found exactly at the exclusive window end', () => {
	const end = epochRange(64).start.getTime();
	expect(rows(payments(), [epoch], end - 1)[0].status).toBe('Pending');
	expect(rows(payments(), [epoch], end)[0].status).toBe('Not found');
});
it('deduplicates and sums payments and attributes a boundary transfer once', () => {
	const payout = payments(
		tx(),
		tx(),
		tx('two', 3_000_000),
		tx('boundary', 4_000_000, epochRange(64).start.toISOString())
	);
	const result = rows(payout, [epoch, { ...epoch, epoch: 63 }]);
	expect(result.map((r) => r.actual)).toEqual([5, 4]);
	expect(result[0].payments.map((p) => p.txid)).toEqual(['one', 'two']);
	expect(cumulativePayouts(payout.value!).at(-1)?.running).toBe(9);
});
it('retains an out-of-window payment in Recorded payouts only', () => {
	const payout = payments(tx('outside', 7_000_000, epochRange(61).start.toISOString()));
	expect(rows(payout)[0].actual).toBeNull();
	expect(rows(payout)[0].payments).toEqual([]);
	expect(cumulativePayouts(payout.value!)).toEqual([
		expect.objectContaining({ txid: 'outside', amount: 7, running: 7 })
	]);
});
it('gives a zero-block week no payout expectation or status', () => {
	for (const payout of [payments(), payments(tx()), { state: 'error', error: 'offline' } as const])
		expect(rows(payout, [{ ...epoch, blocks: 0 }])[0]).toMatchObject({
			status: null,
			payoutText: 'No blocks',
			actual: null,
			payments: []
		});
});
it('incomplete or malformed payments never establish absence or a complete line', () => {
	for (const bad of [tx('', 1), tx('bad', -1), tx('bad', 0.5), tx('bad', 1, 'invalid')]) {
		const result = validatePayouts([tx(), bad]);
		expect(result.complete).toBe(false);
		expect(rows(ready(result))[0].status).toBe('Unavailable');
		expect(cumulativePayouts(result)).toEqual([]);
		expect(result.payments).toHaveLength(1);
	}
});
it('preserves UTC day gaps, a known empty day, and daily microVOI stake units', () => {
	const data = dailyProposals(
		{ '2026-11-07': [], '2026-11-06': [{ id: 1 }], '2025-01-01': [1] },
		1_000_000,
		[{ date: '2026-11-06', avg_online_stake: 10_000_000 }],
		new Date('2026-11-07T23:00:00Z')
	);
	expect(data).toHaveLength(30);
	expect(data.at(-1)).toMatchObject({
		date: '2026-11-07',
		actual: 0,
		current: true,
		expected: null
	});
	expect(data.at(-2)?.expected).toBeCloseTo(86400 / 2.8 / 10);
	expect(data[0].actual).toBeNull();
	expect(
		dailyProposals({ '2026-11-07': [1, 2] }, null, [], new Date('2026-11-07')).at(-1)
	).toMatchObject({ actual: 2, expected: null });
});
it('keeps historical eligible stake in VOI and the epoch 61/62 denominator', async () => {
	vi.stubGlobal('fetch', async () =>
		Response.json({ epochs: [{ epoch_number: 62, eligible_online_stake: 1000 }] })
	);
	const stakes = await loadEligibleStakes(address);
	expect(stakes[0].eligible_online_stake).toBe(1000);
	const snapshot = {
		total_blocks: 120,
		ballast_blocks: 200,
		proposers: { PAGE: 12 },
		start_date: epochRange(61).start.toISOString(),
		end_date: epochRange(61).end.toISOString()
	};
	const old = completedEpoch(snapshot, 61, address, 1400);
	const next = completedEpoch(
		{
			...snapshot,
			start_date: epochRange(62).start.toISOString(),
			end_date: epochRange(62).end.toISOString()
		},
		62,
		address,
		1400
	);
	expect(old.networkBlocks).toBe(160);
	expect(next).toMatchObject({ networkBlocks: 120, estimate: 140 });
	expect(
		mergeRewardRows([next], payments(), now, { balance: 100, online: true }, [
			{ epoch_number: 62, eligible_online_stake: 1000 }
		])[0]
	).toMatchObject({ expected: 12, ratio: 1 });
	expect(() =>
		completedEpoch({ ...snapshot, total_blocks: undefined }, 61, address, 1400)
	).toThrow();
});
it('uses live counts and suppresses early projections', () => {
	const raw = {
		num_blocks: 120,
		num_blocks_ballast: 200,
		max_timestamp: new Date(epochRange(62).start.getTime() + 3.5 * 86400000).toISOString(),
		data: [{ proposer: address, block_count: 12 }]
	};
	const live = liveEpoch(raw, 62, address, 1400);
	expect(live).toMatchObject({ blocks: 12, networkBlocks: 120, current: true });
	const result = mergeRewardRows(
		[live],
		payments(),
		now,
		{ balance: 1000, online: true },
		[{ epoch_number: 62, eligible_online_stake: 1000 }],
		1000
	)[0];
	expect(result.estimate).toBe(70);
	expect(result.status).toBe('In progress');
	expect(
		mergeRewardRows(
			[live],
			payments(),
			now,
			{ balance: 1, online: true },
			[{ epoch_number: 62, eligible_online_stake: 1000 }],
			1000
		)[0].estimate
	).toBeNull();
});
it('uses only the existing payout endpoint, senders and receiver and fails HTTP errors', async () => {
	const fetcher = vi.fn(async (_url: string) => Response.json({ data: [tx()] }));
	vi.stubGlobal('fetch', fetcher);
	expect(await loadPayouts(address, true)).toMatchObject({
		complete: true,
		payments: [{ amount: 2 }]
	});
	const url = new URL(String(fetcher.mock.calls[0][0]), 'https://example.test');
	expect(url.pathname).toBe('/api/mimir');
	expect(Object.fromEntries(url.searchParams)).toEqual({
		action: 'get_account_transactions_multi',
		from_addresses: `{${REWARDS_ADDRESSES.join(',')}}`,
		to_address: address
	});
	vi.stubGlobal('fetch', async () => Response.json({ error: 'failed' }, { status: 500 }));
	await expect(loadPayouts(address)).rejects.toThrow();
});
it('loads completed snapshots and current live rows rather than the lagging snapshot', async () => {
	vi.mocked(dataTable.fetchDateRanges).mockResolvedValue([
		{ epoch: 62, id: 'completed', desc: '' },
		{ epoch: 63, id: 'live', desc: '' }
	]);
	vi.mocked(dataTable.fetchData).mockResolvedValue({
		num_blocks: 120,
		max_timestamp: new Date(epochRange(63).start.getTime() + 86400000).toISOString(),
		data: [{ proposer: address, block_count: 42 }]
	});
	vi.stubGlobal('fetch', async () =>
		Response.json({
			snapshots: [62, 63].map((e) => ({
				start_date: epochRange(e).start.toISOString(),
				end_date: epochRange(e).end.toISOString(),
				total_blocks: 120,
				proposers: { PAGE: 12 }
			}))
		})
	);
	const result = await loadRewardEpochs(address, true);
	expect(result.map((e) => e.blocks)).toEqual([12, 42]);
	expect(dataTable.fetchData).toHaveBeenCalledWith('live', true);
});
it('rejects malformed daily records instead of claiming empty data', async () => {
	vi.stubGlobal('fetch', async () => Response.json({ '2026-11-07': null }));
	await expect(loadDailyProposals(address)).rejects.toThrow();
});
it('discards late address and retry completions and keeps stale data only for the same source and address', async () => {
	const first = Promise.withResolvers<number>();
	const second = Promise.withResolvers<number>();
	const publish = vi.fn();
	const reader = vi
		.fn()
		.mockReturnValueOnce(first.promise)
		.mockResolvedValueOnce(2)
		.mockReturnValueOnce(second.promise)
		.mockRejectedValueOnce(new Error('offline'));
	const source = createReadSource(reader, publish);
	const a = source.load('A');
	await source.load('B');
	first.resolve(1);
	await a;
	expect(publish.mock.lastCall?.[0]).toMatchObject({ state: 'ready', value: 2 });
	const oldRetry = source.load('B', true);
	await source.load('B', true);
	second.resolve(3);
	await oldRetry;
	expect(publish.mock.lastCall?.[0]).toMatchObject({ state: 'stale', value: 2, error: 'offline' });
	const pending = source.load('C');
	expect(publish.mock.lastCall?.[0]).toEqual({ state: 'loading' });
	await pending;
	source.dispose();
});
it('bounds unabortable reads to fifteen seconds and discards disposed work', async () => {
	vi.useFakeTimers();
	const publish = vi.fn();
	const source = createReadSource(() => new Promise<number>(() => {}), publish);
	const pending = source.load(address);
	await vi.advanceTimersByTimeAsync(15000);
	await pending;
	expect(publish.mock.lastCall?.[0]).toMatchObject({ state: 'error' });
	const late = source.load(address);
	source.dispose();
	const count = publish.mock.calls.length;
	await vi.advanceTimersByTimeAsync(15000);
	await late;
	expect(publish).toHaveBeenCalledTimes(count);
});

it('withholds current expected blocks and projections if current eligible supply fails', () => {
	const raw = {
		num_blocks: 120,
		max_timestamp: new Date(epochRange(62).start.getTime() + 3.5 * 86400000).toISOString(),
		data: [{ proposer: address, block_count: 12 }]
	};
	const live = liveEpoch(raw, 62, address, 1400);
	const result = mergeRewardRows([live], payments(), now, { balance: 1000, online: true }, [
		{ epoch_number: 62, eligible_online_stake: 1000 }
	])[0];
	expect(result.expected).toBeNull();
	expect(result.estimate).toBeNull();
});
