import { getTokensByEpoch } from '$lib/utils';
import { dataTable } from './dataTable';

const EPOCHS_PER_YEAR = 52;

/** The node panel's epoch inputs: the stake that shares the pools, and a year of pools. */
export type NodeEpochRewards = { rewardStake: number; epochRewards: number[] };

/**
 * The latest epoch's blacklist row, then the next year's pools from that epoch, read in
 * the order the node panel read them. Null when a read returns unusable data, or as soon as
 * `stale()` says the panel has moved on (the next read is then never started). A read that
 * throws rejects, so the panel reports it with its other reads.
 */
export async function loadNodeEpochRewards(
	supply: { 'online-money': number | bigint },
	stale: () => boolean = () => false
): Promise<NodeEpochRewards | null> {
	const dates = await dataTable.fetchDateRanges();
	if (stale()) return null;
	if (
		!Array.isArray(dates) ||
		dates.length === 0 ||
		!Number.isFinite(dates[dates.length - 1]?.epoch)
	)
		return null;
	const latestEpoch = dates[dates.length - 1];
	const currentEpoch = latestEpoch.epoch;
	const epochData = await dataTable.fetchData(latestEpoch.id);
	if (stale()) return null;
	if (!epochData || !Number.isFinite(Number(epochData.blacklist_balance_total))) return null;

	// Fetch next year's worth of epoch rewards
	const epochPromises = Array.from({ length: EPOCHS_PER_YEAR }, (_, i) =>
		getTokensByEpoch(currentEpoch + i)
	);
	const rewards = await Promise.all(epochPromises);
	if (stale()) return null;
	if (rewards.some((reward) => !Number.isFinite(reward))) return null;

	return {
		rewardStake: Number(supply['online-money']) - Number(epochData.blacklist_balance_total),
		epochRewards: rewards
	};
}

/** The account's share of the pools over a day, a week and a month, in VOI. */
export function projectEpochRewards({
	onlineMoney,
	rewardStake,
	balance,
	epochRewards
}: {
	onlineMoney: number;
	rewardStake: number;
	balance: number;
	epochRewards: number[];
}) {
	function calculateRewardsForPeriod(epochCount: number): number {
		if (!onlineMoney || balance <= 0 || !rewardStake) return 0;

		const shareOfStake = balance / (rewardStake / 1e6);
		let totalReward = 0;

		// Handle the full epochs
		const fullEpochs = Math.floor(epochCount);
		for (let i = 0; i < fullEpochs && i < epochRewards.length; i++) {
			totalReward += shareOfStake * epochRewards[i];
		}

		// Handle the partial epoch if there is one
		const partialEpoch = epochCount - fullEpochs;
		if (partialEpoch > 0 && fullEpochs < epochRewards.length) {
			totalReward += shareOfStake * epochRewards[fullEpochs] * partialEpoch;
		}

		return totalReward / 1e6;
	}
	return {
		perDay: calculateRewardsForPeriod(1 / 7), // 1/7 of a week
		perWeek: calculateRewardsForPeriod(1),
		perMonth: calculateRewardsForPeriod(30.44 / 7) // ~4.33 weeks
	};
}
