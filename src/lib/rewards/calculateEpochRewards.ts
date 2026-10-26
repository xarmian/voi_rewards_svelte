export const REWARDS_ADDRESSES = [
	'62TIVJSZOS4DRSSYYDDZELQAGFYQC5JWKCHRBPPYKTZN2OOOXTGLB5ZJ4E',
	'CAGQDUFUPI6WAQCIQZHPHMX2Z7KACAKZWOMI4R72JV24U4AVAJTGCHA2BE'
] as const;

interface EpochRewardSnapshot {
	total_blocks?: number | null;
	ballast_blocks?: number | null;
}

interface EpochRewards {
	totalBlocksProduced: number;
	userBlocksProduced: number;
	expectedReward: number;
}

export function calculateEpochRewards(
	snapshot: EpochRewardSnapshot,
	epoch: number,
	walletBlocks: number | string | null | undefined,
	tokens: number
): EpochRewards {
	const communityBlocks = snapshot.total_blocks ?? 0;
	// Capped ballast counts through epoch 61; epoch 62 onward uses community blocks only.
	const totalBlocksProduced = Math.round(
		epoch >= 62
			? communityBlocks
			: communityBlocks + Math.min(snapshot.ballast_blocks ?? 0, communityBlocks / 3)
	);
	const blocks = Number(walletBlocks);
	const userBlocksProduced = Number.isFinite(blocks) ? blocks : 0;
	// Empty epochs previously displayed NaN or Infinity in the UI.
	const expectedReward =
		totalBlocksProduced === 0 ? 0 : tokens * (userBlocksProduced / totalBlocksProduced);

	return { totalBlocksProduced, userBlocksProduced, expectedReward };
}
