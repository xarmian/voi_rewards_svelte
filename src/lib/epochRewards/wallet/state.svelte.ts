import type { EpochRewardsState } from './rewards';

/** The rewards tab's epoch sources, all loading until their readers publish. */
export function createEpochRewardsState(): EpochRewardsState {
	const state: EpochRewardsState = $state({
		epochs: { state: 'loading' },
		payouts: { state: 'loading' },
		eligible: { state: 'loading' },
		supply: { state: 'loading' }
	});
	return state;
}
