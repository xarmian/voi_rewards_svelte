// The module's client-side entry: epoch reads and pure helpers for the wallet, calculator,
// node and analytics pages. It pulls in the client rewards cache, so the layout and header
// never import it; they use index.ts.
export { startWalletEpochs } from './wallet/load';
export { epochAnalytics } from './analytics/model';
export type { EpochAnalytics } from './analytics/model';
export { epochCalculator } from './calculator/state.svelte';
export type { EpochCalculator } from './calculator/state.svelte';
export { loadNodeEpochRewards, projectEpochRewards } from './node';
export type { NodeEpochRewards } from './node';
export { createEpochRewardsState, epochRewardReaders } from './wallet/state.svelte';
export { summarizeWalletEpochs, walletEpochView } from './wallet/summary';
export type { EpochSummary, WalletEpoch, WalletEpochSummary } from './wallet/summary';
export {
	cumulativePayouts,
	loadEligibleStakes,
	loadPayouts,
	loadRewardEpochs,
	loadRewardSupply,
	mergeRewardRows,
	missingEpochsMessage,
	recordedPayouts,
	validatePayouts
} from './wallet/rewards';
export type {
	EligibleStake,
	EpochRewardsState,
	Payouts,
	RewardEpoch,
	RewardRow as WalletRewardRow
} from './wallet/rewards';
