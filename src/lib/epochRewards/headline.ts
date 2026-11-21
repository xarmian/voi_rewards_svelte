import { epochRange } from './calendar';
import { comma, compact, pct } from '$lib/ds/format';
import { finite } from '$lib/home/headline';
import type { Loaded } from '$lib/server/loaded';
import type { EpochHomeData } from './home.server';

export type Epoch = {
	epoch_number: number;
	apr?: number | null;
	online_stake?: number | null;
	eligible_online_stake?: number | null;
	participating_wallets?: number | null;
};

export type Headline = {
	epoch: number;
	rangeId: string;
	rangeLabel: string;
	apr: number;
	prevApr: number | null;
	pool: number;
	blocks: number;
	projectedBlocks: number;
	voiPerBlock: number;
	perMillion: number;
	elapsedDays: number;
	earningAccounts: number | null;
};

export function blocksForEpoch(
	epoch: number,
	rows: { num_blocks?: number; num_blocks_ballast?: number }
): number {
	const blocks = finite(rows.num_blocks) ?? NaN;
	return epoch >= 62
		? blocks
		: blocks + Math.min(blocks / 3, finite(rows.num_blocks_ballast) ?? NaN);
}

/** Projections are supplied by the existing clock-dependent utility on the server. */
export function deriveHeadline(
	{
		epoch,
		epochs,
		pool,
		blocks,
		maxTimestamp,
		projection
	}: {
		epoch: number;
		epochs: Epoch[];
		pool: number;
		blocks: number;
		maxTimestamp: string;
		projection: { projectedTotalBlocks: number; projectedRewardPerBlock: number };
	},
	now: Date
): Headline {
	const range = epochRange(epoch);
	const current = epochs.find((row) => row.epoch_number === epoch);
	const previous = epochs.find((row) => row.epoch_number === epoch - 1);
	const stake = finite(current?.eligible_online_stake);
	const elapsed =
		(Math.min(new Date(maxTimestamp).getTime(), now.getTime()) - range.start.getTime()) / 86400000;
	return {
		epoch,
		rangeId: range.id,
		rangeLabel: range.label,
		apr: finite(current?.apr) ?? NaN,
		prevApr: finite(previous?.apr),
		pool,
		blocks,
		projectedBlocks: projection.projectedTotalBlocks,
		voiPerBlock: projection.projectedRewardPerBlock,
		perMillion: stake !== null && stake > 0 ? (pool / stake) * 1000000 : NaN,
		elapsedDays: Math.min(7, Math.max(0, elapsed)),
		earningAccounts: finite(current?.participating_wallets)
	};
}

export function headlineValues(headline: Headline | undefined) {
	return {
		apr: pct(headline?.apr),
		pool: comma(headline?.pool),
		blocks: compact(headline?.blocks, 1),
		projectedBlocks: compact(headline?.projectedBlocks, 1),
		voiPerBlock: comma(headline?.voiPerBlock, 2),
		perMillion: comma(headline?.perMillion),
		elapsedDays: comma(headline?.elapsedDays, 1)
	};
}

export function accountsDetail(loaded: Loaded<number>): string | undefined {
	return loaded.state !== 'error' && Number.isFinite(loaded.value) && loaded.value > 0
		? `/ ${comma(loaded.value)} online`
		: undefined;
}

/** A retry can replace rows only until the user takes control of the epoch select. */
export function rewardsRefreshMode(
	initial: Pick<EpochHomeData['rewards'], 'state'>,
	hasSelectedEpoch: boolean
): 'all' | 'dates' | 'none' {
	return initial.state === 'error' ? 'none' : hasSelectedEpoch ? 'dates' : 'all';
}
