import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ dates: vi.fn(), rows: vi.fn(), pool: vi.fn() }));
vi.mock('../../stores/dataTable', () => ({
	dataTable: { fetchDateRanges: mocks.dates, fetchData: mocks.rows }
}));
vi.mock('$lib/utils', () => ({ getTokensByEpoch: mocks.pool }));
import { loadNodeEpochRewards, projectEpochRewards } from './node';

const supply = { 'online-money': 1_000_000 };
const dates = [{ id: 'latest', epoch: 62 }];

beforeEach(() => {
	vi.clearAllMocks();
	mocks.dates.mockResolvedValue(dates);
	mocks.rows.mockResolvedValue({ blacklist_balance_total: 0 });
	mocks.pool.mockResolvedValue(10);
});

for (const [label, epochData, dateRanges, reward] of [
	['undefined epoch data', undefined, dates, 10],
	['an epoch error body', { error: 'unavailable' }, dates, 10],
	['empty dates', { blacklist_balance_total: 0 }, [], 10],
	['a missing epoch', { blacklist_balance_total: 0 }, [{ id: 'latest' }], 10],
	['non-finite rewards', { blacklist_balance_total: 0 }, dates, NaN]
] as const) {
	test(`node reports ${label} as an error and stops loading`, async () => {
		mocks.dates.mockResolvedValue(dateRanges);
		mocks.rows.mockResolvedValue(epochData);
		mocks.pool.mockResolvedValue(reward);
		expect(await loadNodeEpochRewards(supply)).toBeNull();
	});
}

test('a failed read rejects, so the panel handles it with its other reads', async () => {
	mocks.rows.mockRejectedValue(new Error('proposers API down'));
	await expect(loadNodeEpochRewards(supply)).rejects.toThrow('proposers API down');
});

test('a superseded request stops after the date ranges, before the epoch row', async () => {
	let stale = false;
	mocks.dates.mockImplementation(async () => {
		stale = true;
		return dates;
	});
	expect(await loadNodeEpochRewards(supply, () => stale)).toBeNull();
	expect(mocks.rows).not.toHaveBeenCalled();
	expect(mocks.pool).not.toHaveBeenCalled();
});

test('a superseded request stops after the epoch row, before the pools', async () => {
	let stale = false;
	mocks.rows.mockImplementation(async () => {
		stale = true;
		return { blacklist_balance_total: 0 };
	});
	expect(await loadNodeEpochRewards(supply, () => stale)).toBeNull();
	expect(mocks.pool).not.toHaveBeenCalled();
});

test('reads the latest epoch row, then a year of pools from that epoch', async () => {
	mocks.rows.mockResolvedValue({ blacklist_balance_total: 250_000 });
	mocks.pool.mockImplementation(async (epoch: number) => epoch * 10);
	const result = await loadNodeEpochRewards(supply);
	expect(mocks.dates).toHaveBeenCalledWith();
	expect(mocks.rows).toHaveBeenCalledWith('latest');
	expect(mocks.pool.mock.calls.map(([epoch]) => epoch)).toEqual(
		Array.from({ length: 52 }, (_, index) => 62 + index)
	);
	expect(result).toEqual({
		rewardStake: 750_000,
		epochRewards: Array.from({ length: 52 }, (_, index) => (62 + index) * 10)
	});
});

test('projects the day, week and month from the pools at the balance share', () => {
	const input = {
		onlineMoney: 1_000_000_000,
		rewardStake: 500_000_000,
		balance: 50,
		epochRewards: [700, 1400, 2100, 2800, 3500]
	};
	const { perDay, perWeek, perMonth } = projectEpochRewards(input);
	const share = 50 / 500;
	expect(perDay).toBeCloseTo((share * 700) / 7 / 1e6);
	expect(perWeek).toBeCloseTo((share * 700) / 1e6);
	const weeks = 30.44 / 7;
	const partial = weeks - 4;
	expect(perMonth).toBeCloseTo((share * (700 + 1400 + 2100 + 2800) + share * 3500 * partial) / 1e6);
});

test('projects nothing without a balance, online stake or reward stake', () => {
	const input = { onlineMoney: 1e9, rewardStake: 5e8, balance: 50, epochRewards: [700] };
	for (const missing of [
		{ balance: 0 },
		{ onlineMoney: 0 },
		{ rewardStake: 0 },
		{ epochRewards: [] }
	]) {
		const { perDay, perWeek } = projectEpochRewards({ ...input, ...missing });
		expect(perDay + perWeek, JSON.stringify(missing)).toBe(0);
	}
});
