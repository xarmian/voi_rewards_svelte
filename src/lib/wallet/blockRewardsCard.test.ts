import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_REWARD_PAGE_SIZE, loadBlockRewards, type BlockReward } from './blockRewards';
import {
	blockRewardCount,
	createBlockRewardPager,
	createBlockRewardsState,
	historyTotals,
	lagMinutes,
	mergeBlockRewards,
	morePagesAvailable,
	nextRewardStep,
	weekForecastText,
	type BlockRewardPages
} from './blockRewardsCard';

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
		expect(nextRewardStep(30, 10, false)).toBe('reveal');
		expect(nextRewardStep(30, 10, true)).toBe('reveal');
	});
	it('fetches when every loaded row is shown and the last page was full', () => {
		expect(nextRewardStep(100, 100, true)).toBe('fetch');
		expect(nextRewardStep(100, 120, true)).toBe('fetch');
	});
	it('does nothing when every row is shown and no page remains', () => {
		expect(nextRewardStep(10, 10, false)).toBeNull();
		expect(nextRewardStep(4, 10, false)).toBeNull();
		expect(nextRewardStep(0, 10, false)).toBeNull();
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
