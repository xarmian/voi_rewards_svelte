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
	/** The full pool times the row's current block share: the old table's full-epoch estimate. */
	epochEst: number | null;
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
			// Same flooring as the removed RewardsTable's epoch_block_rewards (TASK-96).
			const epochEst =
				validTotal && pool !== null && pool > 0
					? finite(Math.floor(Math.floor((pool / total) * row.block_count * 1e7) / 10) / 1e6)
					: null;
			return {
				addr: row.proposer,
				rank: index + 1,
				blocks: row.block_count,
				share: validTotal ? finite(row.block_count / total) : null,
				est,
				epochEst,
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

/** Every row matching the search and the All/Favourites view, across all pages. */
export function filterRewardRows<
	R extends RewardRow & {
		name?: string;
		nickname?: string;
		nodes?: { node_name: string | null }[];
	}
>(
	rows: R[],
	{ query, show, favourites }: { query: string; show: string; favourites: string[] }
): R[] {
	return rows.filter(
		(row) => filterProposer(row, query) && (show !== 'favourites' || favourites.includes(row.addr))
	);
}

export type RewardTotals = {
	accounts: number;
	blocks: number;
	est: number | null;
	usd: number | null;
};

/** Sums for the footer row (TASK-98); null for no rows. A total is missing if any row's is. */
export function rewardTotals(rows: RewardRow[]): RewardTotals | null {
	if (!rows.length) return null;
	const sum = (pick: (row: RewardRow) => number | null) =>
		rows.reduce<number | null>((total, row) => {
			const value = pick(row);
			return total === null || value === null ? null : total + value;
		}, 0);
	return {
		accounts: rows.length,
		blocks: rows.reduce((total, row) => total + row.blocks, 0),
		est: sum((row) => row.est),
		usd: sum((row) => row.usd)
	};
}

export function rewardsCSV(rows: RewardRow[]): string {
	return 'account,block_rewards\n' + rows.map((row) => [row.addr, row.est].join(',')).join('\n');
}
