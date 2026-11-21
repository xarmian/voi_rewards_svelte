// The module's client-side entry: epoch reads and pure helpers for the wallet pages.
// It pulls in the client rewards cache, so the layout and header never import it;
// they use index.ts.
export { startWalletEpochs } from './wallet/load';
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
