import { config } from '$lib/config';
import { EPOCH_REWARDS_ENABLED, type EpochHomeData, type EpochResponse } from '$lib/epochRewards';
import { startEpochHome } from '$lib/epochRewards/home.server';
import { finite } from '$lib/home/headline';
import { marketsSummary, topMarkets, type Markets } from '$lib/home/markets';
import { fetchWithTimeout } from './fetchWithTimeout';
import {
	CRITICAL_TIMEOUT_MS,
	STAKE_TIMEOUT_MS,
	STREAM_TIMEOUT_MS,
	failure,
	list,
	ready,
	record,
	type Loaded
} from './loaded';

export { CRITICAL_TIMEOUT_MS, STAKE_TIMEOUT_MS, STREAM_TIMEOUT_MS, type Loaded };
export type Price = { price: number; change24h: number | null; mcap: number | null };
type HomeBase = {
	page: 'dashboard';
	chrome: 'hero';
	onlineStake: Promise<Loaded<{ date: string; stake: number }[]>>;
	markets: Promise<Loaded<Markets>>;
	price: Promise<Loaded<Price>>;
	onlineCount: Promise<Loaded<number>>;
};
// The epoch fields are absent when epoch rewards are switched off; the page still reads
// them unguarded, so the type keeps them required until it does.
export type DashboardData = HomeBase & EpochHomeData;
export type HomeData = DashboardData;
export type RewardRows = EpochResponse;

export async function loadHome(
	url: URL,
	fetcher: typeof fetch,
	now = new Date()
): Promise<HomeData> {
	const startedAt = Date.now();
	async function read<T>(
		url: string,
		parse: (value: unknown) => T,
		timeoutMs = CRITICAL_TIMEOUT_MS
	): Promise<Loaded<T>> {
		try {
			let payload: unknown;
			await fetchWithTimeout(url, {
				timeoutMs,
				cache: 'no-store',
				// Keep JSON body consumption inside the same deadline as the upstream read.
				fetch: async (input, init) => {
					const response = await fetcher(input, init);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					payload = await response.json();
					return response;
				}
			});
			return ready(parse(payload));
		} catch {
			return failure('Data is temporarily unavailable. Please retry.');
		}
	}
	// The epoch reads start first, as they always have; with epoch rewards off there are none.
	const epoch = EPOCH_REWARDS_ENABLED ? startEpochHome({ url, now, startedAt, read }) : undefined;
	const onlineStake = read(
		`${config.proposalApiBaseUrl}?action=online-stake-history`,
		(value) => {
			const cutoff = new Date(now);
			cutoff.setUTCHours(0, 0, 0, 0);
			cutoff.setUTCDate(cutoff.getUTCDate() - 29);
			return list(value)
				.map((value) => {
					const row = record(value);
					return { date: String(row.date), stake: (finite(row.avg_online_stake) ?? NaN) / 1e6 };
				})
				.filter(
					(row) =>
						Number.isFinite(row.stake) &&
						Date.parse(row.date) >= cutoff.getTime() &&
						Date.parse(row.date) <= now.getTime()
				)
				.sort((a, b) => a.date.localeCompare(b.date))
				.slice(-30);
		},
		STAKE_TIMEOUT_MS
	);
	const marketResponse = read(
		'/api/markets?token=VOI',
		(value) => {
			const data = record(value);
			return { marketData: list(data.marketData), aggregates: record(data.aggregates) };
		},
		STREAM_TIMEOUT_MS
	);
	const markets: DashboardData['markets'] = marketResponse.then((loaded) => {
		if (loaded.state === 'error') return loaded;
		return ready({
			rows: topMarkets(loaded.value),
			...marketsSummary(loaded.value),
			asOf: now.toISOString()
		});
	});
	const price: DashboardData['price'] = marketResponse.then((loaded) => {
		if (loaded.state === 'error') return loaded;
		const { marketData, aggregates } = loaded.value;
		const price = finite(aggregates.weightedAveragePrice);
		if (!marketData.length || price === null || price <= 0)
			return failure('No market price available.');
		const first =
			marketData[0] && typeof marketData[0] === 'object'
				? (marketData[0] as Record<string, unknown>)
				: {};
		// Rows are volume-sorted; a Mimir pool row has no change without a 24h price window (TASK-89).
		const withChange = marketData.find(
			(row) =>
				!!row &&
				typeof row === 'object' &&
				finite((row as Record<string, unknown>).price_change_percentage_24h) !== null
		) as Record<string, unknown> | undefined;
		return ready({
			price,
			change24h: finite(withChange?.price_change_percentage_24h),
			mcap: finite(aggregates.marketCap ?? first.market_cap)
		});
	});
	const onlineCount = read(
		'/api/mimir?action=get_online_account_count',
		(value) => {
			const data = record(value);
			const count = finite(data.data);
			if (data.error || count === null || count <= 0) throw new Error('Missing online count');
			return count;
		},
		STREAM_TIMEOUT_MS
	);
	const loaded = await epoch;
	// The page payload keeps its key order, so the serialized page is unchanged.
	return {
		page: 'dashboard',
		chrome: 'hero',
		...(loaded && { currentEpoch: loaded.currentEpoch, rewardsEpoch: loaded.rewardsEpoch }),
		markets,
		...(loaded && {
			headline: loaded.headline,
			rewards: loaded.rewards,
			aprHistory: loaded.aprHistory,
			currentStake: loaded.currentStake
		}),
		onlineStake,
		price,
		onlineCount
	} as HomeData;
}
