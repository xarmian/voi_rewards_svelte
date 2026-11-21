import { EPOCH_REWARDS_ENABLED } from './config';
import { epochAt } from './calendar';
import type { EpochHomeData } from './home.server';

export { EPOCH_REWARDS_ENABLED } from './config';
export { epochAt, epochRange } from './calendar';
export { blocksForEpoch } from './headline';
export type { Epoch, Headline } from './headline';
export type { EpochResponse, RewardRow } from './table';
export type { EpochHistorySource } from './source';
export type { EpochHomeData } from './home.server';
export type { EpochSummary, WalletEpoch, WalletEpochSummary } from './wallet/summary';
export type { EpochRewardsState } from './wallet/rewards';

/** The epoch the clock is in, or undefined when epoch rewards are off. */
export function liveEpoch(date: Date): number | undefined {
	return EPOCH_REWARDS_ENABLED ? epochAt(date) : undefined;
}

/** The epoch the header badge names: the home headline's, once it is ready. */
export function headerEpoch(data: unknown): number | undefined {
	if (!EPOCH_REWARDS_ENABLED || !data || typeof data !== 'object') return undefined;
	const headline = (data as { headline?: { state?: string; value?: { epoch?: unknown } } })
		.headline;
	const epoch = headline?.state === 'ready' ? headline.value?.epoch : undefined;
	return typeof epoch === 'number' ? epoch : undefined;
}

const EPOCH_HOME_KEYS = [
	'currentEpoch',
	'rewardsEpoch',
	'headline',
	'rewards',
	'aprHistory',
	'currentStake'
] as const;

/**
 * The home payload's epoch fields, or null when epoch rewards are off or the load
 * skipped them. The fields are the payload's own references, not copies: the rewards
 * table tells a fresh load from a rerender by identity.
 */
export function epochHomeData(data: Partial<EpochHomeData>): EpochHomeData | null {
	if (!EPOCH_REWARDS_ENABLED || EPOCH_HOME_KEYS.some((key) => data[key] === undefined)) return null;
	const { currentEpoch, rewardsEpoch, headline, rewards, aprHistory, currentStake } =
		data as EpochHomeData;
	return { currentEpoch, rewardsEpoch, headline, rewards, aprHistory, currentStake };
}
