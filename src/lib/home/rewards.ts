import { blocksForEpoch } from './headline';

export function showAfterFavouritesChange(show: string, favouriteCount: number): string {
	return favouriteCount === 0 ? 'all' : show;
}

export function rewardsClock(maxTimestamp: string | undefined, now: number): Date {
	const clock = new Date(maxTimestamp ?? now);
	return Number.isNaN(clock.getTime()) ? new Date(now) : clock;
}

export type EpochResponse = {
	data: {
		proposer: string;
		block_count: number;
		nodes?: { node_name: string | null }[];
		nfd?: string;
	}[];
	num_blocks: number;
	num_blocks_ballast: number;
	blacklist?: string[];
	block_height?: number;
	max_timestamp?: string;
};
export type RewardRow = {
	addr: string;
	rank: number;
	blocks: number;
	share: number | null;
	est: number | null;
	usd: number | null;
};
export const totalBlocksFor = blocksForEpoch;
const finite = (n: number): number | null => (Number.isFinite(n) ? n : null);

export function rewardRows(
	res: EpochResponse,
	{
		epoch,
		rangeId,
		pool,
		now,
		price
	}: {
		epoch: number;
		rangeId: string;
		pool: number | null;
		now: Date;
		price: number | null;
	}
): RewardRow[] {
	const total = totalBlocksFor(epoch, res);
	// Same projection and rounding as extrapolateRewardPerBlock, with an explicit
	// clock so this function stays pure. The range's final day ends at 23:59:59.999 UTC.
	const end = rangeId.slice(9);
	const endTime = Date.parse(
		`${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}T23:59:59.999Z`
	);
	const remainingDays = Math.max(0, (endTime - now.getTime()) / 86400000);
	const projected = Math.round(total + (total / (7 - remainingDays)) * remainingDays);
	const validTotal = Number.isFinite(total) && total > 0;
	const perBlock =
		validTotal &&
		pool !== null &&
		pool > 0 &&
		Number.isFinite(pool) &&
		Number.isFinite(projected) &&
		projected > 0
			? finite(pool / projected)
			: null;
	const blacklist = new Set(res.blacklist ?? []);
	return res.data
		.filter((row) => !blacklist.has(row.proposer))
		.slice()
		.sort((a, b) => b.block_count - a.block_count)
		.map((row, index) => {
			const est = perBlock === null ? null : finite(row.block_count * perBlock);
			return {
				addr: row.proposer,
				rank: index + 1,
				blocks: row.block_count,
				share: validTotal ? finite(row.block_count / total) : null,
				est,
				usd: est !== null && price !== null && price > 0 ? finite(est * price) : null
			};
		});
}

export function filterProposer(
	row: { addr: string; name?: string; nickname?: string; nodes?: { node_name: string | null }[] },
	query: string
): boolean {
	const term = query.toLowerCase();
	return [
		row.addr,
		row.name,
		row.nickname,
		...(row.nodes ?? []).map((node) => node.node_name)
	].some((value) => value?.toLowerCase().includes(term));
}

export function rewardsCSV(rows: RewardRow[]): string {
	return 'account,block_rewards\n' + rows.map((row) => [row.addr, row.est].join(',')).join('\n');
}
