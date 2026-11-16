import { comma, compact, pct } from '$lib/ds/format';
import { forecastBlockRewards, networkPace, type Forecast } from '$lib/rewards/blockRewardForecast';
import type { BlockRewardFunding, BlockRewardStatus } from '$lib/rewards/blockRewardStatus';
import {
	BLOCK_REWARD_PAGE_SIZE,
	loadBlockRewards,
	type BlockReward,
	type BlockRewardDay,
	type NetworkBlockRewardDay
} from './blockRewards';
import { boundedRead, type Source } from './read';

export type BlockRewardsState = {
	status: Source<BlockRewardStatus & { balance: number }>;
	funding: Source<{ funding: BlockRewardFunding; bonus: number | null }>;
	daily: Source<BlockRewardDay[]>;
	network: Source<NetworkBlockRewardDay[]>;
	onlineStake: Source<number>;
	lastRound: Source<number>;
	recent: Source<BlockReward[]>;
};

export function createBlockRewardsState(): BlockRewardsState {
	return {
		status: { state: 'loading' },
		funding: { state: 'loading' },
		daily: { state: 'loading' },
		network: { state: 'loading' },
		onlineStake: { state: 'loading' },
		lastRound: { state: 'loading' },
		recent: { state: 'loading' }
	};
}

/** Block time used when the recent network pace is unavailable. */
export const FALLBACK_BLOCK_TIME = 2.8;

type Total = { count: number; amount: number };

const utcDate = (now: Date, offset = 0) =>
	new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - offset * 86400000)
		.toISOString()
		.slice(0, 10);

/** Today's UTC row, the seven UTC days through today, and every returned row. */
export function historyTotals(
	rows: BlockRewardDay[],
	now: Date
): { today: Total; week: Total; month: Total } {
	const today = utcDate(now);
	const weekStart = utcDate(now, 6);
	const sum = (keep: (row: BlockRewardDay) => boolean) =>
		rows
			.filter(keep)
			.reduce(
				(total, row) => ({ count: total.count + row.count, amount: total.amount + row.amount }),
				{
					count: 0,
					amount: 0
				}
			);
	return {
		today: sum((row) => row.day === today),
		week: sum((row) => row.day >= weekStart && row.day <= today),
		month: sum(() => true)
	};
}

export function blockRewardCount(count: number): string {
	return `${comma(count)} block reward${count === 1 ? '' : 's'}`;
}

/** "42 block rewards (34–50), ≈ 418 VOI"; under one expected reads "<1 block reward". */
export function weekForecastText(forecast: Forecast): string {
	const count = Math.round(forecast.expectedCount);
	const voi = forecast.expectedMicroVoi / 1e6;
	return `${count === 0 && forecast.expectedCount > 0 ? '<1 block reward' : blockRewardCount(count)} (${comma(forecast.range[0])}–${comma(forecast.range[1])}), ≈ ${compact(voi, voi < 10 ? 2 : 0)} VOI`;
}

/** A whole percent, two decimals under 1%, and ">99%" rather than ever reading as certain. */
export function chanceText(chance: number): string {
	const percent = chance * 100;
	return percent > 99 ? '>99%' : pct(percent, percent < 1 ? 2 : 0);
}

/**
 * Forecast for the next `seconds` from the status balance, online stake, last round, bonus
 * and network pace; null when any input is missing. Pace is judged at the time the network
 * rows were read, so the clock passing UTC midnight does not leave the new day looking
 * unindexed.
 */
export function blockRewardForecast(state: BlockRewardsState, seconds: number): Forecast | null {
	const status = state.status.value;
	const onlineStake = state.onlineStake.value;
	const round = state.lastRound.value;
	const bonus = state.funding.value?.bonus;
	const network = state.network;
	const pace = network.value ? networkPace(network.value, new Date(network.asOf)) : null;
	if (!status || onlineStake === undefined || round === undefined || bonus == null || !pace)
		return null;
	return forecastBlockRewards({
		stake: status.balance,
		onlineStake,
		blockTime: pace.blockTime,
		avgFees: pace.avgFees,
		bonus,
		round,
		seconds,
		eligible: status.registered
	});
}

/**
 * Whether the page is a staking contract, an ordinary account, or unknown: not known to be a
 * contract while the owner lookup that would tell failed.
 */
export function blockRewardContract(
	isContract: boolean,
	ownerLookup: 'ok' | 'unavailable'
): 'contract' | 'account' | 'unknown' {
	if (isContract) return 'contract';
	return ownerLookup === 'unavailable' ? 'unknown' : 'account';
}

/** Whole minutes of lag, at least one. */
export function lagMinutes(lag: number, pace: { blockTime: number } | null): number {
	return Math.max(1, Math.round((lag * (pace?.blockTime ?? FALLBACK_BLOCK_TIME)) / 60));
}

/** Rows in order, keeping the first row for each transaction id. */
export function mergeBlockRewards(rows: BlockReward[], next: BlockReward[]): BlockReward[] {
	const seen = new Set(rows.map((row) => row.txid));
	return rows.concat(next.filter((row) => !seen.has(row.txid) && !!seen.add(row.txid)));
}

export type BlockRewardPages = {
	/** Rows loaded after the first page. */
	extra: BlockReward[];
	/** Size of the most recent extra page, or null before any. */
	lastPageSize: number | null;
	state: 'idle' | 'loading' | 'error';
	error?: string;
};

export const emptyBlockRewardPages = (): BlockRewardPages => ({
	extra: [],
	lastPageSize: null,
	state: 'idle'
});

/** Whether the most recent page was full, so an older page may exist. */
export function morePagesAvailable(firstPage: BlockReward[], pages: BlockRewardPages): boolean {
	return (pages.lastPageSize ?? firstPage.length) === BLOCK_REWARD_PAGE_SIZE;
}

/** Rows shown before any request for more, and how many more each request reveals. */
export const BLOCK_REWARD_ROWS_SHOWN = 10;
export const BLOCK_REWARD_ROWS_STEP = 25;

/**
 * Reveal loaded rows that are hidden; otherwise fetch an older page when one may exist.
 * Loaded rows can be revealed from a first page that is refreshing or failed to refresh,
 * but an older page is fetched only off a settled first page, so two reads never mix.
 */
export function nextRewardStep(
	loaded: number,
	visible: number,
	pageAvailable: boolean,
	firstPage: Source<unknown>['state']
): 'reveal' | 'fetch' | null {
	if (loaded > visible) return firstPage === 'ready' || firstPage === 'stale' ? 'reveal' : null;
	return pageAvailable && firstPage === 'ready' ? 'fetch' : null;
}

/** Older pages for one address; a reset drops any response still in flight. */
export function createBlockRewardPager(publish: (pages: BlockRewardPages) => void) {
	let generation = 0;
	let address = '';
	let pages = emptyBlockRewardPages();
	const set = (next: BlockRewardPages) => publish((pages = next));
	return {
		reset(requested: string) {
			generation++;
			address = requested;
			set(emptyBlockRewardPages());
		},
		async more(rows: BlockReward[]) {
			const last = rows.at(-1);
			if (!last || pages.state === 'loading') return;
			const requestGeneration = generation;
			set({ ...pages, state: 'loading', error: undefined });
			try {
				const page = await boundedRead(loadBlockRewards(address, last.round));
				if (requestGeneration !== generation) return;
				const known = new Set(rows.map((row) => row.txid));
				set({
					extra: mergeBlockRewards(
						pages.extra,
						page.filter((row) => !known.has(row.txid))
					),
					lastPageSize: page.length,
					state: 'idle'
				});
			} catch (cause) {
				if (requestGeneration !== generation) return;
				set({
					...pages,
					state: 'error',
					error: cause instanceof Error ? cause.message : String(cause)
				});
			}
		},
		dispose() {
			generation++;
		}
	};
}
