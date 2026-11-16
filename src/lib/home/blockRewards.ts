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

/** The network rows end with today (UTC). */
export function todayRow(rows: NetworkBlockRewardDay[]): NetworkBlockRewardDay | undefined {
	return rows[rows.length - 1];
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

/** Daily VOI over the last seven rows, oldest first. */
export function weekSeries(rows: NetworkBlockRewardDay[]): number[] {
	return rows.slice(-7).map((row) => row.amount / 1e6);
}

/** A VOI figure, as on the wallet block reward card. */
export function voiAmount(value: number): string {
	return value > 0 && value < 0.01 ? '<0.01 VOI' : `${compact(value, 2)} VOI`;
}
