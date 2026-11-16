import { comma, MISSING } from '$lib/ds/format';
import type { NetworkBlockRewardDay } from '$lib/wallet/blockRewards';

export type BlockRewardDayRow = {
	date: string;
	blocks: number;
	rewardedBlocks: number;
	/** Percent of the day's blocks that were rewarded, or null on a day with no blocks. */
	share: number | null;
	voi: number;
};

/** Chart and table rows for daily real-time block rewards, in the input order (oldest first). */
export function blockRewardDayRows(days: NetworkBlockRewardDay[]): BlockRewardDayRow[] {
	return days.map((day) => ({
		date: day.day,
		blocks: day.blocks,
		rewardedBlocks: day.rewardedBlocks,
		share: day.blocks > 0 ? (day.rewardedBlocks / day.blocks) * 100 : null,
		voi: day.amount / 1e6
	}));
}

/** A rewarded share with one decimal place ("4.1%"), or the missing marker. */
export function shareText(share: number | null): string {
	return share === null || !Number.isFinite(share) ? MISSING : `${share.toFixed(1)}%`;
}

/** The chart summary: window length, total VOI, the in-progress day and what is left out. */
export function blockRewardSummary(rows: BlockRewardDayRow[]): string {
	const total = rows.reduce((sum, row) => sum + row.voi, 0);
	return `Real-time block rewards paid to block proposers, in VOI per UTC day over the last ${rows.length} UTC ${rows.length === 1 ? 'day' : 'days'}, totalling ${comma(total, 2)} VOI. Today (UTC) is still in progress, and epoch rewards are not included.`;
}
