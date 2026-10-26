import { describe, expect, it } from 'vitest';
import { calculateEpochRewards, REWARDS_ADDRESSES } from '$lib/rewards/calculateEpochRewards';

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

for (const component of ['PortfolioComponent', 'EpochComponent', 'calculateEpochRewards']) {
	describe(`${component} inline epoch-reward characterization`, () => {
		const calculate =
			component === 'calculateEpochRewards'
				? (snapshot: Snapshot, date: { epoch: number }, wallet: string, tokens: number) =>
						calculateEpochRewards(snapshot, date.epoch, snapshot.proposers[wallet], tokens)
				: inlineRewards(component);
		const snapshot: Snapshot = {
			total_blocks: 120,
			ballast_blocks: 20,
			proposers: { wallet: 12 }
		};

		it.each([
			['includes ballast at epoch 61', 61, 140, 120],
			['excludes ballast from epoch 62', 62, 120, 140]
		] as const)('%s', (_rule, epoch, blocks, reward) => {
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

		if (component !== 'calculateEpochRewards') {
			it('currently produces NaN for a zero-block epoch with no wallet blocks', () => {
				expect(
					calculate({ total_blocks: 0, proposers: {} }, { epoch: 62 }, 'wallet', 1400)
				).toEqual({
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
		}

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

describe('canonical epoch reward guards', () => {
	it.each([61, 62])(
		'returns zero rewards for a zero-block epoch %i, replacing old NaN and Infinity',
		(epoch) => {
			for (const blocks of [0, 12]) {
				const result = calculateEpochRewards(
					{ total_blocks: 0, ballast_blocks: 200 },
					epoch,
					blocks,
					1400
				);
				expect(result).toEqual({
					totalBlocksProduced: 0,
					userBlocksProduced: blocks,
					expectedReward: 0
				});
				expect(Number.isFinite(result.expectedReward)).toBe(true);
			}
		}
	);
	it('returns zero when the snapshot omits its block counts', () => {
		expect(calculateEpochRewards({}, 61, undefined, 1400)).toEqual({
			totalBlocksProduced: 0,
			userBlocksProduced: 0,
			expectedReward: 0
		});
	});
	it("explicitly changes Portfolio's old 'bad' proposer reward from NaN to canonical zero", () => {
		const snapshot = { total_blocks: 120, proposers: { wallet: 'bad' } };
		expect(
			PortfolioComponentRewards(snapshot, { epoch: 62 }, 'wallet', 1400).expectedReward
		).toBeNaN();
		expect(calculateEpochRewards(snapshot, 62, 'bad', 1400)).toEqual({
			totalBlocksProduced: 120,
			userBlocksProduced: 0,
			expectedReward: 0
		});
	});
	it.each(['bad', NaN, Infinity, -Infinity, 'Infinity', undefined, null])(
		'normalizes a non-finite or absent proposer count %s to zero',
		(blocks) => {
			expect(calculateEpochRewards({ total_blocks: 120 }, 62, blocks, 1400)).toEqual({
				totalBlocksProduced: 120,
				userBlocksProduced: 0,
				expectedReward: 0
			});
		}
	);
	it('preserves both reward sender addresses and their order', () => {
		expect(REWARDS_ADDRESSES).toEqual([
			'62TIVJSZOS4DRSSYYDDZELQAGFYQC5JWKCHRBPPYKTZN2OOOXTGLB5ZJ4E',
			'CAGQDUFUPI6WAQCIQZHPHMX2Z7KACAKZWOMI4R72JV24U4AVAJTGCHA2BE'
		]);
	});
});
