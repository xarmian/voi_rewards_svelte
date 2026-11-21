import { createReadSource } from '$lib/wallet/read';
import {
	loadEligibleStakes,
	loadPayouts,
	loadRewardEpochs,
	loadRewardSupply,
	type EpochRewardsState
} from './rewards';

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

/**
 * One reader per epoch source, each publishing into `state`; null without the epoch
 * sources (epoch rewards off), so no epoch read can start.
 */
export function epochRewardReaders(state: EpochRewardsState | null) {
	if (!state) return null;
	return {
		epochs: createReadSource(loadRewardEpochs, (result) => (state.epochs = result)),
		payouts: createReadSource(loadPayouts, (result) => (state.payouts = result)),
		eligible: createReadSource(loadEligibleStakes, (result) => (state.eligible = result)),
		supply: createReadSource(loadRewardSupply, (result) => (state.supply = result))
	};
}
