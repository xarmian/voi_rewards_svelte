import { describe, expect, it } from 'vitest';
import type { NetworkBlockRewardDay } from '$lib/wallet/blockRewards';
import {
	createHomeBlockRewardsState,
	rewardedShare,
	todayDetail,
	todayRow,
	voiFigure,
	weekSeries
} from './blockRewards';

const row = (day: string, amount: number, blocks = 30_000, rewardedBlocks = 1_234) =>
	({
		day,
		blocks,
		rewardedBlocks,
		amount,
		feesCollected: 0,
		lastRound: null
	}) satisfies NetworkBlockRewardDay;
const days = (count: number) =>
	Array.from({ length: count }, (_, i) =>
		row(`2026-11-${String(i + 1).padStart(2, '0')}`, (i + 1) * 1_000_000)
	);

describe('home block reward derivations', () => {
	it('takes the last row as today', () => {
		expect(todayRow(days(10))?.day).toBe('2026-11-10');
		expect(todayRow([])).toBeUndefined();
	});

	it('shows the rewarded share with one decimal place', () => {
		expect(rewardedShare(1_234, 30_000)).toBe('4.1%');
		expect(todayDetail(row('2026-11-10', 0))).toBe('1,234 of 30,000 blocks rewarded (4.1%)');
	});

	it('shows no share and no NaN before the first block of the day', () => {
		expect(rewardedShare(0, 0)).toBeNull();
		const detail = todayDetail(row('2026-11-10', 0, 0, 0));
		expect(detail).toBe('No blocks yet today');
		expect(detail).not.toMatch(/NaN|%/);
	});

	it('builds the series from the seven complete days before today, in VOI, oldest first', () => {
		expect(weekSeries(days(30))).toEqual([23, 24, 25, 26, 27, 28, 29]);
	});

	it('uses every complete day when fewer than seven are present, and never today', () => {
		expect(weekSeries(days(3))).toEqual([1, 2]);
		expect(weekSeries(days(1))).toEqual([]);
		expect(weekSeries([])).toEqual([]);
	});

	it('formats VOI figures like the wallet block reward card, without the unit', () => {
		expect(voiFigure(2)).toBe('2');
		expect(voiFigure(0.001)).toBe('<0.01');
		expect(voiFigure(0)).toBe('0');
		expect(voiFigure(12_345.678)).toBe('12.35k');
	});

	it('starts both sources loading', () => {
		expect(createHomeBlockRewardsState()).toEqual({
			network: { state: 'loading' },
			funding: { state: 'loading' }
		});
	});
});
