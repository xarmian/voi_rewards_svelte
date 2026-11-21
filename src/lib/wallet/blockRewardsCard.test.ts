import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_REWARD_PAGE_SIZE, loadBlockRewards, type BlockReward } from './blockRewards';
import {
	blockRewardContract,
	blockRewardCount,
	blockRewardForecast,
	chanceText,
	currentStatus,
	createBlockRewardPager,
	createBlockRewardsState,
	historyTotals,
	lagMinutes,
	mergeBlockRewards,
	morePagesAvailable,
	nextRewardStep,
	weekForecastText,
	type BlockRewardPages,
	type BlockRewardsState
} from './blockRewardsCard';
import { forecastBlockRewards, FORECAST_PERIOD_SECONDS } from '$lib/rewards/blockRewardForecast';

vi.mock('./blockRewards', async (original) => ({
	...(await original<typeof import('./blockRewards')>()),
	loadBlockRewards: vi.fn()
}));

const reward = (round: number, txid = `TX${round}`): BlockReward => ({
	round,
	time: '2026-11-07T00:00:00.000Z',
	txid,
	amount: 5_000_000,
	bonus: 5_000_000,
	feesCollected: 0,
	partial: false
});
const deferred = <T>() => {
	let resolve!: (value: T) => void;
	let reject!: (cause: unknown) => void;
	const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
	return { promise, resolve, reject };
};

beforeEach(() => vi.mocked(loadBlockRewards).mockReset());

describe('createBlockRewardsState', () => {
	it('starts every source loading', () => {
		expect(Object.values(createBlockRewardsState()).every((s) => s.state === 'loading')).toBe(true);
		expect(Object.keys(createBlockRewardsState()).sort()).toEqual(
			['daily', 'funding', 'lastRound', 'network', 'onlineStake', 'recent', 'status'].sort()
		);
	});
});

describe('historyTotals', () => {
	const now = new Date('2026-11-07T12:00:00Z');
	it('totals today, the seven days through today, and every row', () => {
		const totals = historyTotals(
			[
				{ day: '2026-10-09', count: 1, amount: 1_000_000 },
				{ day: '2026-10-31', count: 4, amount: 10_000_000 },
				{ day: '2026-11-01', count: 1, amount: 500_000 },
				{ day: '2026-11-03', count: 2, amount: 3_500_000 },
				{ day: '2026-11-07', count: 1, amount: 2_000_000 }
			],
			now
		);
		expect(totals).toEqual({
			today: { count: 1, amount: 2_000_000 },
			week: { count: 4, amount: 6_000_000 },
			month: { count: 9, amount: 17_000_000 }
		});
	});
	it('reports zero when today has no row', () => {
		expect(historyTotals([{ day: '2026-11-06', count: 3, amount: 9 }], now).today).toEqual({
			count: 0,
			amount: 0
		});
	});
});

describe('formatting helpers', () => {
	it('uses singular and plural block reward counts', () => {
		expect(blockRewardCount(0)).toBe('0 block rewards');
		expect(blockRewardCount(1)).toBe('1 block reward');
		expect(blockRewardCount(1234)).toBe('1,234 block rewards');
	});
	it('converts lag rounds to at least one minute, falling back to 2.8 s blocks', () => {
		expect(lagMinutes(201, null)).toBe(9);
		expect(lagMinutes(201, { blockTime: 3 })).toBe(10);
		expect(lagMinutes(1, null)).toBe(1);
	});
});

describe('mergeBlockRewards', () => {
	it('appends new rows and drops repeated transaction ids', () => {
		expect(
			mergeBlockRewards([reward(9), reward(8)], [reward(8), reward(7)]).map((r) => r.txid)
		).toEqual(['TX9', 'TX8', 'TX7']);
	});
});

describe('morePagesAvailable', () => {
	const full = Array.from({ length: BLOCK_REWARD_PAGE_SIZE }, (_, i) => reward(1000 - i));
	it('follows the size of the most recent page', () => {
		expect(morePagesAvailable(full, { extra: [], lastPageSize: null, state: 'idle' })).toBe(true);
		expect(
			morePagesAvailable(full.slice(1), { extra: [], lastPageSize: null, state: 'idle' })
		).toBe(false);
		expect(morePagesAvailable(full, { extra: [], lastPageSize: 3, state: 'idle' })).toBe(false);
		expect(
			morePagesAvailable(full, {
				extra: [],
				lastPageSize: BLOCK_REWARD_PAGE_SIZE,
				state: 'idle'
			})
		).toBe(true);
	});
});

describe('nextRewardStep', () => {
	it('reveals loaded rows that are hidden', () => {
		expect(nextRewardStep(30, 10, false, 'ready')).toBe('reveal');
		expect(nextRewardStep(30, 10, true, 'ready')).toBe('reveal');
	});
	it('reveals loaded rows from a first page that is refreshing or failed to refresh', () => {
		expect(nextRewardStep(100, 10, true, 'stale')).toBe('reveal');
	});
	it('fetches when every loaded row is shown and the last page was full', () => {
		expect(nextRewardStep(100, 100, true, 'ready')).toBe('fetch');
		expect(nextRewardStep(100, 120, true, 'ready')).toBe('fetch');
	});
	it('never fetches off a first page that is not settled', () => {
		for (const state of ['stale', 'loading', 'error', 'empty'] as const)
			expect(nextRewardStep(100, 100, true, state), state).toBeNull();
	});
	it('does nothing while the first page has no rows to show', () => {
		expect(nextRewardStep(30, 10, true, 'loading')).toBeNull();
		expect(nextRewardStep(30, 10, true, 'error')).toBeNull();
	});
	it('does nothing when every row is shown and no page remains', () => {
		expect(nextRewardStep(10, 10, false, 'ready')).toBeNull();
		expect(nextRewardStep(4, 10, false, 'ready')).toBeNull();
		expect(nextRewardStep(0, 10, false, 'ready')).toBeNull();
	});
});

describe('weekForecastText', () => {
	it('shows the rounded count, the grouped range and the VOI figure', () => {
		expect(
			weekForecastText({
				chance: 1,
				expectedCount: 41.6,
				range: [1200, 1500],
				expectedMicroVoi: 418_400_000
			})
		).toBe('42 block rewards (1,200–1,500), ≈ 418 VOI');
	});
	it('says under one block reward rather than zero when some are expected', () => {
		expect(
			weekForecastText({
				chance: 0.27,
				expectedCount: 0.32,
				range: [0, 1],
				expectedMicroVoi: 1_600_000
			})
		).toBe('<1 block reward (0–1), ≈ 1.6 VOI');
		expect(
			weekForecastText({ chance: 0, expectedCount: 0, range: [0, 0], expectedMicroVoi: 0 })
		).toBe('0 block rewards (0–0), ≈ 0 VOI');
	});
});

describe('createBlockRewardPager', () => {
	it('loads the page before the last row and appends it without duplicates', async () => {
		let pages: BlockRewardPages | undefined;
		const pager = createBlockRewardPager((next) => (pages = next));
		pager.reset('ADDR');
		vi.mocked(loadBlockRewards).mockResolvedValue([reward(8), reward(7)]);
		await pager.more([reward(9), reward(8)]);
		expect(loadBlockRewards).toHaveBeenCalledWith('ADDR', 8);
		expect(pages).toEqual({ extra: [reward(7)], lastPageSize: 2, state: 'idle' });
		vi.mocked(loadBlockRewards).mockResolvedValue([reward(6)]);
		await pager.more(mergeBlockRewards([reward(9), reward(8)], pages!.extra));
		expect(loadBlockRewards).toHaveBeenLastCalledWith('ADDR', 7);
		expect(pages!.extra.map((r) => r.round)).toEqual([7, 6]);
	});

	it('keeps rows on failure and reports the error', async () => {
		let pages: BlockRewardPages | undefined;
		const pager = createBlockRewardPager((next) => (pages = next));
		pager.reset('ADDR');
		vi.mocked(loadBlockRewards).mockResolvedValueOnce([reward(7)]);
		await pager.more([reward(8)]);
		vi.mocked(loadBlockRewards).mockRejectedValueOnce(new Error('offline'));
		await pager.more([reward(8), reward(7)]);
		expect(pages).toEqual({
			extra: [reward(7)],
			lastPageSize: 1,
			state: 'error',
			error: 'offline'
		});
	});

	it('ignores a second request while one is loading', async () => {
		const pager = createBlockRewardPager(() => {});
		pager.reset('ADDR');
		const pending = deferred<BlockReward[]>();
		vi.mocked(loadBlockRewards).mockReturnValue(pending.promise);
		const first = pager.more([reward(8)]);
		void pager.more([reward(8)]);
		expect(loadBlockRewards).toHaveBeenCalledTimes(1);
		pending.resolve([]);
		await first;
	});

	it('drops a late page for a previous address', async () => {
		let pages: BlockRewardPages | undefined;
		const pager = createBlockRewardPager((next) => (pages = next));
		pager.reset('OLD');
		const pending = deferred<BlockReward[]>();
		vi.mocked(loadBlockRewards).mockReturnValue(pending.promise);
		const late = pager.more([reward(8)]);
		pager.reset('NEW');
		pending.resolve([reward(7)]);
		await late;
		expect(pages).toEqual({ extra: [], lastPageSize: null, state: 'idle' });
	});

	it('does nothing without a last row', async () => {
		const pager = createBlockRewardPager(() => {});
		pager.reset('ADDR');
		await pager.more([]);
		expect(loadBlockRewards).not.toHaveBeenCalled();
	});
});

describe('chanceText', () => {
	it('rounds to whole percents, with two decimals under one percent', () => {
		expect(chanceText(0.42)).toBe('42%');
		expect(chanceText(0.004567)).toBe('0.46%');
		expect(chanceText(0.99)).toBe('99%');
	});
	it('never reads as certain', () => {
		expect(chanceText(0.995)).toBe('>99%');
		expect(chanceText(1)).toBe('>99%');
	});
});

describe('blockRewardForecast', () => {
	const ready = <T>(value: T, asOf = 1) => ({ state: 'ready' as const, value, asOf });
	const networkRows = Array.from({ length: 8 }, (_, i) => ({
		day: new Date(Date.parse('2026-10-31T00:00:00Z') + i * 86400000).toISOString().slice(0, 10),
		blocks: 30_000,
		rewardedBlocks: 30_000,
		amount: 0,
		feesCollected: 3_000_000,
		lastRound: null
	}));
	const state = (overrides: Partial<BlockRewardsState> = {}): BlockRewardsState => ({
		...createBlockRewardsState(),
		status: ready({ registered: true, reasons: [], balance: 100_000_000_000, isContract: false }),
		funding: ready({ funding: 'funded' as const, bonus: 5_000_000 }),
		network: ready(networkRows, Date.parse('2026-11-07T11:59:00Z')),
		onlineStake: ready(1_000_000_000_000_000),
		lastRound: ready(5_000_100),
		...overrides
	});
	it('forecasts from the status balance, online stake, round, bonus and network pace', () => {
		expect(blockRewardForecast(state(), FORECAST_PERIOD_SECONDS.day, false)).toEqual(
			forecastBlockRewards({
				stake: 100_000_000_000,
				onlineStake: 1_000_000_000_000_000,
				blockTime: (7 * 86400) / (7 * 30_000),
				avgFees: 100,
				bonus: 5_000_000,
				round: 5_000_100,
				seconds: FORECAST_PERIOD_SECONDS.day,
				eligible: true
			})
		);
	});
	it('judges pace at the time the network rows were read', () => {
		const late = state({
			network: ready(networkRows, Date.parse('2026-11-07T23:59:50Z'))
		});
		expect(blockRewardForecast(late, FORECAST_PERIOD_SECONDS.week, false)).not.toBeNull();
	});
	it('is null while the status was read for the other contract classification', () => {
		expect(blockRewardForecast(state(), FORECAST_PERIOD_SECONDS.day, true)).toBeNull();
	});
	it('is null when any input is missing', () => {
		const missing: Partial<BlockRewardsState>[] = [
			{ status: { state: 'error', error: 'x' } },
			{ onlineStake: { state: 'loading' } },
			{ lastRound: { state: 'error', error: 'x' } },
			{ funding: ready({ funding: 'unknown' as const, bonus: null }) },
			{ network: { state: 'loading' } },
			{ network: ready(networkRows.slice(1), Date.parse('2026-11-07T11:59:00Z')) }
		];
		for (const overrides of missing)
			expect(blockRewardForecast(state(overrides), FORECAST_PERIOD_SECONDS.day, false)).toBeNull();
	});
});

describe('blockRewardContract', () => {
	it('is a contract whenever the page knows it is one', () => {
		expect(blockRewardContract(true, 'ok')).toBe('contract');
		expect(blockRewardContract(true, 'unavailable')).toBe('contract');
	});
	it('is unknown when the owner lookup failed for a page not known to be a contract', () => {
		expect(blockRewardContract(false, 'unavailable')).toBe('unknown');
	});
	it('is an account otherwise', () => {
		expect(blockRewardContract(false, 'ok')).toBe('account');
	});
});

describe('currentStatus', () => {
	const contract = { code: 'contract' as const, text: 'c' };
	const account = { registered: true, reasons: [], balance: 1, isContract: false };
	const contractStatus = { registered: false, reasons: [contract], balance: 1, isContract: true };
	// A capable contract registers like an account: its classification is the read's, not a reason.
	const capable = { registered: true, reasons: [], balance: 1, isContract: true };
	it('keeps a status read for the same classification', () => {
		const ready = { state: 'ready' as const, value: account, asOf: 1 };
		expect(currentStatus(ready, false)).toBe(ready);
		const forContract = { state: 'stale' as const, value: contractStatus, asOf: 1 };
		expect(currentStatus(forContract, true)).toBe(forContract);
		const forCapable = { state: 'ready' as const, value: capable, asOf: 1 };
		expect(currentStatus(forCapable, true)).toBe(forCapable);
	});
	it('reads as loading while a status for the other classification reloads', () => {
		expect(currentStatus({ state: 'stale', value: account, asOf: 1 }, true)).toEqual({
			state: 'loading'
		});
		expect(currentStatus({ state: 'ready', value: contractStatus, asOf: 1 }, false)).toEqual({
			state: 'loading'
		});
		expect(currentStatus({ state: 'ready', value: capable, asOf: 1 }, false)).toEqual({
			state: 'loading'
		});
	});
	it('reads as an error when the reload for the new classification failed', () => {
		expect(currentStatus({ state: 'stale', value: account, asOf: 1, error: 'down' }, true)).toEqual(
			{ state: 'error', error: 'down' }
		);
	});
	it('passes through a source with no value', () => {
		const loading = { state: 'loading' as const };
		expect(currentStatus(loading, true)).toBe(loading);
	});
});
