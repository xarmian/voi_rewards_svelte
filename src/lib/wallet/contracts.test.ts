import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { contractFixture, scheduleNow } from './contracts.fixtures';
const mocks = vi.hoisted(() => ({ list: vi.fn(), account: vi.fn(), decoded: vi.fn() }));
vi.mock('$lib/services/lockvest', () => ({ getLockContractsByOwner: mocks.list }));
vi.mock('$lib/utils/algod', () => ({
	algodClient: { getApplicationByID: () => ({ do: async () => ({ params: {} }) }) }
}));
vi.mock('$lib/chain/lockContract', () => ({ decodeLockContractState: mocks.decoded }));
vi.mock('$lib/stores/accounts', () => ({
	getAccountInfo: mocks.account,
	requireAccountInfo: mocks.account,
	getConsensusInfo: async () => undefined
}));
vi.mock('./load', async (original) => {
	const actual = await original<typeof import('./load')>();
	return { ...actual, readContract: vi.fn(actual.readContract) };
});
import { readContract } from './load';
import {
	loadContracts,
	buildVestingTimeline,
	summarizeContracts,
	scheduleDomain
} from './contracts';
import { summarizeWallet } from './summary';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(scheduleNow);
	vi.mocked(readContract).mockReset();
	mocks.list.mockResolvedValue(
		Array.from({ length: 16 }, (_, n) => ({
			contractId: n + 1,
			contractAddress: `CONTRACT${n + 1}`
		}))
	);
	vi.mocked(readContract).mockImplementation(
		async (account) => contractFixture(account.contractId).details!
	);
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

it('preserves all sixteen IDs and null fields when one read fails', async () => {
	vi.mocked(readContract).mockImplementation(async (account) => {
		if (account.contractId === 9) throw new Error('unreadable');
		return contractFixture(account.contractId).details!;
	});
	const result = await loadContracts('OWNER', 'OWNER');
	expect(result.contractSet).toBe('ready');
	expect(result.contracts.map((c) => c.contractId)).toEqual(
		Array.from({ length: 16 }, (_, n) => n + 1)
	);
	expect(result.contracts[8]).toMatchObject({
		address: 'CONTRACT9',
		details: null,
		balance: null,
		isParticipating: null
	});
	expect(summarizeContracts(result.contracts).locked).toBeNull();
	expect(summarizeContracts(result.contracts).available).toBeNull();
});
it('distinguishes a successful empty list from an unavailable list', async () => {
	mocks.list.mockResolvedValue([]);
	expect(await loadContracts('OWNER', 'OWNER')).toMatchObject({
		contractSet: 'ready',
		contracts: []
	});
	mocks.list.mockRejectedValue(new Error('list failed'));
	expect(await loadContracts('OWNER', 'OWNER')).toMatchObject({
		contractSet: 'unavailable',
		contracts: []
	});
	expect(readContract).not.toHaveBeenCalled();
});
it('keeps raw details by identity and converts display amounts exactly once', async () => {
	const row = contractFixture();
	Object.freeze(row.details);
	mocks.list.mockResolvedValue([{ contractAddress: row.address, contractId: row.contractId }]);
	vi.mocked(readContract).mockResolvedValue(row.details!);
	const result = await loadContracts('OWNER', 'OWNER');
	expect(result.contracts[0].details).toBe(row.details);
	expect(result.contracts[0].balance).toBe(12);
	expect(summarizeContracts(result.contracts)).toMatchObject({ locked: 8, available: 3.9 });
	const timeline = buildVestingTimeline(result.contracts, scheduleNow);
	expect(timeline.events[0]).toMatchObject({
		amount: 2,
		contractId: 1,
		date: row.details!.nextVestingDate!.toISOString()
	});
	expect(timeline.events.reduce((sum, e) => sum + e.amount, 0)).toBe(8);
	expect(timeline.months.at(-1)?.cumulative).toBe(8);
	expect(row.details!.availableForWithdrawal).toBe(3.9e6);
});
it('caps locked display at the actual account balance', () => {
	expect(summarizeContracts([{ ...contractFixture(), balance: 3 }]).locked).toBe(3);
});
it('a child route reads and shows that child only and never adds its balance twice', async () => {
	const result = await loadContracts('OWNER', 'CONTRACT3');
	expect(result.contracts.map((c) => c.contractId)).toEqual([3]);
	expect(readContract).toHaveBeenCalledTimes(1);
	const child = contractFixture(3);
	const summary = summarizeWallet({
		owner: child,
		contracts: [child],
		current: null,
		history: [],
		state: 'ready',
		now: scheduleNow,
		tokens: { state: 'ready', lp: 0, other: 0, lpCount: 0, tokenCount: 0 }
	});
	expect(summary.holdings.total).toBe(12);
});
it('fully vested contracts have no future releases', () => {
	const timeline = buildVestingTimeline(
		[
			contractFixture(1, {
				isFullyVested: true,
				nextVestingDate: null,
				nextVestingAmount: 0,
				remainingVestingAmount: 0,
				lockedBalance: 0
			})
		],
		scheduleNow
	);
	expect(timeline.events).toEqual([]);
	expect(timeline.unavailable).toEqual([]);
});
it.each([
	{ fundingTime: null },
	{ distributionSeconds: 0 },
	{ distributionCount: 0 },
	{ nextVestingAmount: NaN },
	{ totalAmount: 'invalid' },
	{ remainingVestingAmount: 10e6 }
])('does not fabricate a release for invalid or unfunded terms %j', (changes) => {
	const timeline = buildVestingTimeline([contractFixture(1, changes)], scheduleNow);
	expect(timeline.events).toEqual([]);
	expect(timeline.months).toEqual([]);
	expect(timeline.unavailable).toEqual([1]);
});
it('a partial schedule never starts a complete cumulative release at zero', () => {
	const timeline = buildVestingTimeline(
		[contractFixture(), { ...contractFixture(2), details: null }],
		scheduleNow
	);
	expect(timeline.complete).toBe(false);
	expect(timeline.months).toEqual([]);
	expect(timeline.unavailable).toEqual([2]);
});
it('uses the existing zero-lockup first-window reader result as the first timeline event', async () => {
	const actual = await vi.importActual<typeof import('./load')>('./load');
	mocks.decoded.mockReturnValue({
		global_owner: 'OWNER',
		global_funding: String(Date.parse('2026-12-31T00:00:00Z') / 1000),
		global_lockup_delay: 0,
		global_period: 1,
		global_period_seconds: 86400,
		global_vesting_delay: 2,
		global_total: '8000000',
		global_distribution_count: 4,
		global_distribution_seconds: 86400
	});
	mocks.account.mockResolvedValue({
		amount: 12e6,
		minBalance: 100000,
		status: 'Online',
		round: 100
	});
	const row = contractFixture();
	const details = await actual.readContract(row, false);
	expect(details.nextVestingDate?.toISOString()).toBe('2027-01-02T00:00:00.000Z');
	const first = buildVestingTimeline([{ ...row, details }], scheduleNow).events[0];
	expect(first.date).toBe(details.nextVestingDate!.toISOString());
	expect(first.amount).toBe(details.nextVestingAmount / 1e6);
});
it('bounds a list read at fifteen seconds', async () => {
	mocks.list.mockReturnValue(new Promise(() => {}));
	const pending = loadContracts('OWNER', 'OWNER');
	await vi.advanceTimersByTimeAsync(15000);
	expect(await pending).toMatchObject({ contractSet: 'unavailable' });
});

it('keeps the loaded schedule when the clock passes the first release', () => {
	const row = contractFixture(1);
	const later = Date.parse('2027-01-02T06:00:00Z');
	const timeline = buildVestingTimeline([row], later);
	expect(timeline.complete).toBe(true);
	expect(timeline.unavailable).toEqual([]);
	expect(timeline.events).toHaveLength(4);
	expect(Date.parse(timeline.months[0].date)).toBeLessThanOrEqual(
		Date.parse(timeline.events[0].date)
	);
});

it('starts the chart domain at the first plotted point when the clock is past a release', () => {
	const row = contractFixture(1);
	const later = Date.parse('2027-01-02T06:00:00Z');
	const timeline = buildVestingTimeline([row], later);
	const [start, end] = scheduleDomain(timeline.months, later);
	for (const month of timeline.months) {
		expect(Date.parse(month.date)).toBeGreaterThanOrEqual(start.getTime());
		expect(Date.parse(month.date)).toBeLessThanOrEqual(end.getTime());
	}
	expect(scheduleDomain([], later)[0].getTime()).toBe(later);
});
