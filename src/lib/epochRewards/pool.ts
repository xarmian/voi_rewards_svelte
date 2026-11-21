interface ExtrapolatedRewards {
	projectedTotalBlocks: number;
	projectedRewardPerBlock: number;
}

export function extrapolateRewardPerBlock(
	currentTotalBlocks: number,
	rewardPool: number,
	selectedDate?: string
): ExtrapolatedRewards {
	const now = new Date();
	let endDate: Date;

	if (selectedDate) {
		// Parse the date from selectedDate format "testnet2_YYYYMMDD"
		endDate = new Date(
			parseInt(selectedDate.substring(9, 13)),
			parseInt(selectedDate.substring(13, 15)) - 1,
			parseInt(selectedDate.substring(15, 17))
		);
		endDate.setUTCHours(23, 59, 59, 999);
	} else {
		// Calculate next Tuesday midnight UTC
		endDate = new Date();
		endDate.setUTCDate(endDate.getUTCDate() + ((2 + 7 - endDate.getUTCDay()) % 7));
		endDate.setUTCHours(23, 59, 59, 999);
	}

	const remainingTime = endDate.getTime() - now.getTime();
	const remainingDays = Math.max(0, remainingTime / (1000 * 60 * 60 * 24));
	const currentBlocksPerDay = currentTotalBlocks / (7 - remainingDays);
	const projectedTotalBlocks = Math.round(currentTotalBlocks + currentBlocksPerDay * remainingDays);
	const projectedRewardPerBlock = rewardPool / projectedTotalBlocks;

	return {
		projectedTotalBlocks,
		projectedRewardPerBlock
	};
}
