import { comma, compact } from '$lib/ds/format';
import type { Source } from '$lib/wallet/read';
import type { loadBlockRewardFunding, NetworkBlockRewardDay } from '$lib/wallet/blockRewards';

export type HomeBlockRewardFunding = Awaited<ReturnType<typeof loadBlockRewardFunding>>;

export type HomeBlockRewardsState = {
	network: Source<NetworkBlockRewardDay[]>;
	funding: Source<HomeBlockRewardFunding>;
};

export function createHomeBlockRewardsState(): HomeBlockRewardsState {
	return { network: { state: 'loading' }, funding: { state: 'loading' } };
}

const utcDate = (now: Date, offset = 0) =>
	new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - offset * 86400000)
		.toISOString()
		.slice(0, 10);

/** The row for today's UTC date, if the data has one. */
export function todayRow(
	rows: NetworkBlockRewardDay[],
	now: Date
): NetworkBlockRewardDay | undefined {
	const today = utcDate(now);
	return rows.find((row) => row.day === today);
}

/** Rewarded blocks as a percent with one decimal place, or null before any block. */
export function rewardedShare(rewardedBlocks: number, blocks: number): string | null {
	if (!(blocks > 0)) return null;
	return `${((rewardedBlocks / blocks) * 100).toFixed(1)}%`;
}

export function todayDetail(row: NetworkBlockRewardDay): string {
	const share = rewardedShare(row.rewardedBlocks, row.blocks);
	if (share === null) return 'No blocks yet today';
	return `${comma(row.rewardedBlocks)} of ${comma(row.blocks)} blocks rewarded (${share})`;
}

/** Daily VOI for the seven UTC dates before today, oldest first; dates with no row are left out. */
export function weekSeries(rows: NetworkBlockRewardDay[], now: Date): number[] {
	const byDay = new Map(rows.map((row) => [row.day, row]));
	return [7, 6, 5, 4, 3, 2, 1].flatMap((offset) => {
		const row = byDay.get(utcDate(now, offset));
		return row ? [row.amount / 1e6] : [];
	});
}

/** A VOI figure without its unit, rounded as on the wallet block reward card. */
export function voiFigure(value: number): string {
	return value > 0 && value < 0.01 ? '<0.01' : compact(value, 2);
}
