// Test data: a home payload with or without the epoch fields.
import type { HomeData } from '$lib/server/home';

export function homeData(withEpoch: boolean): HomeData {
	const base: HomeData = {
		page: 'dashboard',
		chrome: 'hero',
		markets: Promise.resolve({
			state: 'ready',
			value: { rows: [], volume24h: null, liquidity: null, asOf: '2026-10-25T02:38:45Z' }
		}),
		onlineStake: Promise.resolve({
			state: 'ready',
			value: [{ date: '2026-10-25', stake: 725200000 }]
		}),
		price: Promise.resolve({
			state: 'ready',
			value: { price: 0.000127, change24h: -1.01, mcap: 265986 }
		}),
		onlineCount: Promise.resolve({ state: 'ready', value: 152 })
	};
	if (!withEpoch) return base;
	return {
		...base,
		currentEpoch: 104,
		rewardsEpoch: 104,
		headline: {
			state: 'ready',
			value: {
				epoch: 104,
				rangeId: '20261021-20261027',
				rangeLabel: 'Oct 21 – Oct 27, 2026',
				apr: 16.04,
				prevApr: 16.2,
				pool: 2236808,
				blocks: 126874,
				projectedBlocks: 216074,
				voiPerBlock: 10.35,
				perMillion: 3084,
				elapsedDays: 4.1,
				earningAccounts: 97
			}
		},
		currentStake: { state: 'ready', value: 729891544.76 },
		aprHistory: {
			state: 'ready',
			value: [
				{ epoch: 103, apr: 16.2, wallets: 99 },
				{ epoch: 104, apr: 16.04, wallets: 97 }
			]
		},
		rewards: {
			state: 'ready',
			value: {
				rangeId: '20261021-20261027',
				data: {
					data: [{ proposer: 'wallet', block_count: 126874, nodes: [] }],
					num_blocks: 126874,
					num_blocks_ballast: 0
				},
				params: {
					block_reward_pool: 2236808,
					total_blocks: 126874,
					reward_per_block: 10.3507,
					total_blocks_projected: 216102
				}
			}
		}
	};
}
