import { describe, expect, it } from 'vitest';
import { MISSING } from '$lib/ds/format';
import type { NetworkBlockRewardDay } from '$lib/wallet/blockRewards';
import { blockRewardDayRows, blockRewardSummary, shareText } from './blockRewards';

const day = (over: Partial<NetworkBlockRewardDay> = {}): NetworkBlockRewardDay => ({
	day: '2026-11-14',
	blocks: 30_000,
	rewardedBlocks: 1_234,
	amount: 1_234_567_890,
	feesCollected: 0,
	lastRound: null,
	...over
});

describe('blockRewardDayRows', () => {
	it('converts micro-VOI to VOI and keeps the block counts', () => {
		expect(blockRewardDayRows([day()])).toEqual([
			{
				date: '2026-11-14',
				blocks: 30_000,
				rewardedBlocks: 1_234,
				share: (1_234 / 30_000) * 100,
				voi: 1234.56789
			}
		]);
	});

	it('gives a null share for a day with no blocks and no NaN anywhere in the row', () => {
		const [row] = blockRewardDayRows([day({ blocks: 0, rewardedBlocks: 0, amount: 0 })]);
		expect(row.share).toBeNull();
		expect(row.voi).toBe(0);
		expect(Object.values(row).some((v) => typeof v === 'number' && !Number.isFinite(v))).toBe(
			false
		);
	});

	it('preserves the input order', () => {
		const rows = blockRewardDayRows([
			day({ day: '2026-11-12' }),
			day({ day: '2026-11-13' }),
			day({ day: '2026-11-14' })
		]);
		expect(rows.map((r) => r.date)).toEqual(['2026-11-12', '2026-11-13', '2026-11-14']);
	});
});

describe('shareText', () => {
	it('shows one decimal place with a percent sign', () => {
		expect(shareText((1_234 / 30_000) * 100)).toBe('4.1%');
		expect(shareText(0)).toBe('0.0%');
	});

	it('shows the missing marker for a null share', () => {
		expect(shareText(null)).toBe(MISSING);
	});
});

describe('blockRewardSummary', () => {
	it('names the day count, the in-progress day, the total and the excluded epoch rewards', () => {
		const rows = blockRewardDayRows([
			day({ day: '2026-11-13', amount: 1_500_000 }),
			day({ day: '2026-11-14', amount: 2_250_000 })
		]);
		const text = blockRewardSummary(rows);
		expect(text).toContain('2 UTC days');
		expect(text).toContain('in progress');
		expect(text).toContain('3.75 VOI');
		expect(text).toMatch(/epoch rewards are not included/i);
		expect(text).not.toMatch(/payout/i);
	});
});
