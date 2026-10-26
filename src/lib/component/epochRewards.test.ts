import { describe, expect, it } from 'vitest';

interface Snapshot {
	total_blocks?: number;
	ballast_blocks?: number;
	proposers: Record<string, number | string | undefined>;
}

interface Rewards {
	totalBlocksProduced: number;
	userBlocksProduced: number | string;
	expectedReward: number;
}

// Verbatim inline calculations captured before extraction. Keep their old
// zero-block and malformed-count results as explicit historical references.
function PortfolioComponentRewards(
	epochData: Snapshot,
	date: { epoch: number },
	walletAddress: string,
	tokens: number
): Rewards {
	const communityBlocks = epochData.total_blocks ?? 0;
	const totalBlocksProduced = Math.round(
		date.epoch >= 62
			? communityBlocks
			: communityBlocks + Math.min(epochData.ballast_blocks ?? 0, communityBlocks / 3)
	);
	const userBlocksProduced = epochData.proposers[walletAddress] ?? 0;

	// @ts-expect-error Preserve the original implicit coercion of string counts.
	const expectedReward = tokens * (userBlocksProduced / totalBlocksProduced);
	return { totalBlocksProduced, userBlocksProduced, expectedReward };
}

function EpochComponentRewards(
	epochData: Snapshot,
	date: { epoch: number },
	walletAddress: string,
	tokens: number
): Rewards {
	const communityBlocks = epochData.total_blocks ?? 0;
	const totalBlocksProduced = Math.round(
		date.epoch >= 62
			? communityBlocks
			: communityBlocks + Math.min(epochData.ballast_blocks ?? 0, communityBlocks / 3)
	);
	const userBlocksProduced = Number(epochData.proposers[walletAddress] ?? 0) || 0;

	const expectedReward = tokens * (userBlocksProduced / totalBlocksProduced);
	return { totalBlocksProduced, userBlocksProduced, expectedReward };
}

function inlineRewards(component: string) {
	return component === 'PortfolioComponent' ? PortfolioComponentRewards : EpochComponentRewards;
}

for (const component of ['PortfolioComponent', 'EpochComponent']) {
	describe(`${component} inline epoch-reward characterization`, () => {
		const calculate = inlineRewards(component);
		const snapshot: Snapshot = {
			total_blocks: 120,
			ballast_blocks: 20,
			proposers: { wallet: 12 }
		};

		it.each([
			[61, 140, 120],
			[62, 120, 140]
		])('currently epoch %i produces %i blocks and %i rewards', (epoch, blocks, reward) => {
			expect(calculate(snapshot, { epoch }, 'wallet', 1400)).toEqual({
				totalBlocksProduced: blocks,
				userBlocksProduced: 12,
				expectedReward: reward
			});
		});

		it('caps ballast at one third of community blocks before epoch 62', () => {
			expect(
				calculate({ ...snapshot, ballast_blocks: 200 }, { epoch: 61 }, 'wallet', 1400)
			).toEqual({ totalBlocksProduced: 160, userBlocksProduced: 12, expectedReward: 105 });
		});

		it('excludes even oversized ballast from epoch 62 onward', () => {
			expect(
				calculate({ ...snapshot, ballast_blocks: 200 }, { epoch: 62 }, 'wallet', 1400)
			).toEqual({ totalBlocksProduced: 120, userBlocksProduced: 12, expectedReward: 140 });
		});

		it.each([61, 62])('treats missing ballast as zero at epoch %i', (epoch) => {
			expect(
				calculate({ total_blocks: 120, proposers: { wallet: 12 } }, { epoch }, 'wallet', 1400)
			).toEqual({ totalBlocksProduced: 120, userBlocksProduced: 12, expectedReward: 140 });
		});

		it('rounds the capped block total before dividing', () => {
			expect(
				calculate(
					{ ...snapshot, total_blocks: 100, ballast_blocks: 200 },
					{ epoch: 61 },
					'wallet',
					1330
				)
			).toEqual({ totalBlocksProduced: 133, userBlocksProduced: 12, expectedReward: 120 });
		});

		it('currently produces NaN for a zero-block epoch with no wallet blocks', () => {
			expect(calculate({ total_blocks: 0, proposers: {} }, { epoch: 62 }, 'wallet', 1400)).toEqual({
				totalBlocksProduced: 0,
				userBlocksProduced: 0,
				expectedReward: NaN
			});
		});

		it('currently produces Infinity for zero total blocks and positive wallet blocks', () => {
			expect(
				calculate({ total_blocks: 0, proposers: { wallet: 12 } }, { epoch: 62 }, 'wallet', 1400)
			).toEqual({ totalBlocksProduced: 0, userBlocksProduced: 12, expectedReward: Infinity });
		});

		it('preserves the component-specific handling of a numeric string proposer count', () => {
			expect(
				calculate({ ...snapshot, proposers: { wallet: '12' } }, { epoch: 62 }, 'wallet', 1400)
			).toEqual({
				totalBlocksProduced: 120,
				userBlocksProduced: component === 'PortfolioComponent' ? '12' : 12,
				expectedReward: 140
			});
		});

		it('preserves the component-specific reward for a nonnumeric proposer count', () => {
			expect(
				calculate({ ...snapshot, proposers: { wallet: 'bad' } }, { epoch: 62 }, 'wallet', 1400)
			).toEqual({
				totalBlocksProduced: 120,
				userBlocksProduced: component === 'PortfolioComponent' ? 'bad' : 0,
				expectedReward: component === 'PortfolioComponent' ? NaN : 0
			});
		});
	});
}
