import { epochRange } from '$lib/epochs';
import { comma, compact, MISSING, pct, usd } from '$lib/ds/format';
import type { DashboardData, Headline, Loaded, Price } from '$lib/server/home';

export type Epoch = {
	epoch_number: number;
	apr?: number | null;
	online_stake?: number | null;
	eligible_online_stake?: number | null;
	participating_wallets?: number | null;
};

export function finite(value: unknown): number | null {
	if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

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
		earningAccounts: finite(current?.participating_wallets),
		// epoch-detail keeps the current epoch's online stake live, as /analytics shows it.
		onlineStake: finite(current?.online_stake)
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

export function priceTile(loaded: Loaded<Price>) {
	if (loaded.state === 'error')
		return { state: 'error' as const, value: MISSING, href: '/markets' };
	const { price, change24h, mcap } = loaded.value;
	return {
		state: loaded.state,
		value: usd(price),
		href: '/markets',
		change:
			change24h !== null && Number.isFinite(change24h)
				? { value: change24h, label: '24h' }
				: undefined,
		detail: `24h · mcap ${usd(mcap)}`,
		asOf: loaded.state === 'stale' ? loaded.asOf : undefined
	};
}

/**
 * The value is the current online stake from the headline (epoch-detail); the streamed
 * history only draws the sparkline, whose last point is today's partial-day average.
 */
export function onlineStakeTile(
	headline: Loaded<Headline>,
	history?: Loaded<{ date: string; stake: number }[]>
) {
	if (headline.state === 'error')
		return { state: 'error' as const, value: MISSING, href: '/analytics' };
	const trend = history && history.state !== 'error' ? history.value.map((row) => row.stake) : [];
	return {
		state: headline.state,
		value: compact(headline.value.onlineStake, 1),
		detail: trend.length ? 'VOI · 30-day daily avg' : 'VOI',
		trend,
		href: '/analytics',
		asOf: headline.state === 'stale' ? headline.asOf : undefined
	};
}

export function accountsDetail(loaded: Loaded<number>): string | undefined {
	return loaded.state !== 'error' && Number.isFinite(loaded.value) && loaded.value > 0
		? `/ ${comma(loaded.value)} online`
		: undefined;
}

/** A retry can replace rows only until the user takes control of the epoch select. */
export function rewardsRefreshMode(
	initial: Pick<DashboardData['rewards'], 'state'>,
	hasSelectedEpoch: boolean
): 'all' | 'dates' | 'none' {
	return initial.state === 'error' ? 'none' : hasSelectedEpoch ? 'dates' : 'all';
}
