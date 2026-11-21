import { EPOCH_REWARDS_ENABLED } from './config';
import { epochAt } from './calendar';

export { EPOCH_REWARDS_ENABLED } from './config';
export { epochAt, epochRange } from './calendar';
export { blocksForEpoch } from './headline';
export type { Epoch, Headline } from './headline';
export type { EpochResponse, RewardRow } from './table';
export type { EpochHistorySource } from './source';

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
