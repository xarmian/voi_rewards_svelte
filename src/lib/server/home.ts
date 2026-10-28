import { config } from '$lib/config';
import { epochAt, epochRange } from '$lib/epochs';
import { blocksForEpoch, deriveHeadline, finite, type Epoch } from '$lib/home/headline';
import { getTokensByEpoch, extrapolateRewardPerBlock } from '$lib/utils';
import { buildDateRanges, type DateRange, type RewardParams } from '../../stores/dataTable';
import { fetchWithTimeout } from './fetchWithTimeout';

export const CRITICAL_TIMEOUT_MS = 4000;
export const STREAM_TIMEOUT_MS = 5000;
// The stake history upstream routinely takes 3.6-4.3 s; it is streamed, so a longer deadline blocks nothing.
export const STAKE_TIMEOUT_MS = 8000;

export type Loaded<T> =
	| { state: 'ready'; value: T }
	| { state: 'stale'; value: T; asOf: string }
	| { state: 'error'; message: string };
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
	onlineStake: number | null;
};
export type Price = { price: number; change24h: number | null; mcap: number | null };
export type DashboardData = {
	page: 'dashboard';
	chrome: 'hero';
	headline: Loaded<Headline>;
	aprHistory: Loaded<{ epoch: number; apr: number; wallets: number | null }[]>;
	onlineStake: Promise<Loaded<{ date: string; stake: number }[]>>;
	rewards: Loaded<{ rangeId: string; dates: DateRange[]; data: unknown; params: RewardParams }>;
	price: Promise<Loaded<Price>>;
	onlineCount: Promise<Loaded<number>>;
};
export type HomeData =
	| DashboardData
	| {
			page: 'quests';
			pageMetaTags: { title: string; description: string; imageUrl: string };
	  };
export type RewardRows = {
	data: Record<string, unknown>[];
	num_blocks: number;
	num_blocks_ballast: number;
	max_timestamp: string;
};
const ready = <T>(value: T): Loaded<T> => ({ state: 'ready', value });
const failure = (message: string): { state: 'error'; message: string } => ({
	state: 'error',
	message
});
const record = (value: unknown): Record<string, unknown> => {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Invalid response');
	return value as Record<string, unknown>;
};
const list = (value: unknown): unknown[] => {
	if (!Array.isArray(value)) throw new Error('Invalid list');
	return value;
};

export async function loadHome(
	url: URL,
	fetcher: typeof fetch,
	now = new Date()
): Promise<HomeData> {
	const startedAt = Date.now();
	if (url.hostname === 'quests.voirewards.com')
		return {
			page: 'quests',
			pageMetaTags: {
				title: 'Voi Testnet Quests',
				description: 'Get Your Quest On, with the Voi Testnet Network',
				imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png'
			}
		};
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
	const requestedEpoch = epochAt(now);
	const fetchRows = (epoch: number, timeoutMs = CRITICAL_TIMEOUT_MS) => {
		if (timeoutMs <= 0) return Promise.resolve(failure('Unable to load epoch rewards.'));
		const range = epochRange(epoch);
		return read(
			`${config.proposalApiBaseUrl}?start=${range.start.toISOString().slice(0, 10)}&end=${range.end.toISOString().slice(0, 10)}`,
			(value) => {
				const rows = record(value);
				list(rows.data);
				if (finite(rows.num_blocks) === null) throw new Error('Missing blocks');
				return rows as RewardRows;
			},
			timeoutMs
		);
	};
	// Start all independent critical reads before awaiting any of them.
	const basePromise = read(config.proposalApiBaseUrl, (value) => {
		const timestamp = record(value).max_timestamp;
		if (
			typeof timestamp !== 'string' ||
			!Number.isFinite(Date.parse(timestamp)) ||
			epochAt(new Date(timestamp)) < 1
		)
			throw new Error('Invalid timestamp');
		return timestamp;
	});
	const rowsPromise = fetchRows(requestedEpoch);
	const previousRowsPromise =
		now.getTime() - epochRange(requestedEpoch).start.getTime() < 24 * 60 * 60 * 1000
			? fetchRows(requestedEpoch - 1)
			: undefined;
	const epochsPromise = read('/api/epochs', (value) =>
		list(record(value).epochs).map((value) => {
			const row = record(value);
			const epoch = finite(row.epoch_number);
			if (epoch === null) throw new Error('Missing epoch');
			return {
				epoch_number: epoch,
				apr: finite(row.apr),
				online_stake: finite(row.online_stake),
				eligible_online_stake: finite(row.eligible_online_stake),
				participating_wallets: finite(row.participating_wallets)
			} satisfies Epoch;
		})
	);
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
	const price = read(
		'/api/markets?token=VOI',
		(value) => {
			const data = record(value);
			const aggregates = record(data.aggregates);
			const price = finite(aggregates.weightedAveragePrice);
			if (price === null || price <= 0) throw new Error('Missing price');
			const first =
				Array.isArray(data.marketData) && data.marketData.length ? record(data.marketData[0]) : {};
			return {
				price,
				change24h: finite(first.price_change_percentage_24h),
				mcap: finite(aggregates.marketCap ?? first.market_cap)
			};
		},
		STREAM_TIMEOUT_MS
	);
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
	// A boundary correction depends only on the base read, not on the speculative rows.
	const selectedPromise = basePromise.then(async (base) => {
		const epoch =
			base.state === 'error'
				? requestedEpoch
				: Math.min(requestedEpoch, epochAt(new Date(base.value)));
		const selectedRows =
			epoch === requestedEpoch
				? rowsPromise
				: epoch === requestedEpoch - 1 && previousRowsPromise
					? previousRowsPromise
					: fetchRows(epoch, CRITICAL_TIMEOUT_MS - (Date.now() - startedAt));
		return { epoch, rows: await selectedRows };
	});
	const [base, selected, epochs] = await Promise.all([basePromise, selectedPromise, epochsPromise]);
	const { epoch, rows } = selected;
	let rewards: DashboardData['rewards'] = failure('Unable to load epoch rewards.');
	let headline: DashboardData['headline'] = failure('Unable to load the epoch headline.');
	if (base.state !== 'error' && rows.state !== 'error') {
		const range = epochRange(epoch);
		const pool = await getTokensByEpoch(epoch);
		const blocks = blocksForEpoch(epoch, rows.value);
		const projection = extrapolateRewardPerBlock(blocks, pool, range.id);
		rewards = ready({
			rangeId: range.id,
			dates: buildDateRanges(new Date(base.value)),
			data: rows.value,
			// The legacy table reads a store synchronously during SSR. Carry these
			// alongside the untouched upstream payload, even when epoch-detail fails.
			params: {
				block_reward_pool: pool,
				total_blocks: blocks,
				reward_per_block: projection.projectedRewardPerBlock,
				total_blocks_projected: projection.projectedTotalBlocks
			}
		});
		if (epochs.state !== 'error' && epochs.value.some((row) => row.epoch_number === epoch)) {
			headline = ready(
				deriveHeadline(
					{
						epoch,
						epochs: epochs.value,
						pool,
						blocks,
						maxTimestamp: base.value,
						projection
					},
					now
				)
			);
		}
	}
	const aprHistory: DashboardData['aprHistory'] =
		epochs.state === 'error'
			? epochs
			: ready(
					epochs.value
						.filter((row) => row.epoch_number <= epoch)
						.sort((a, b) => a.epoch_number - b.epoch_number)
						.slice(-26)
						.map((row) => ({
							epoch: row.epoch_number,
							apr: row.apr ?? NaN,
							wallets: row.participating_wallets
						}))
				);
	return {
		page: 'dashboard',
		chrome: 'hero',
		headline,
		rewards,
		aprHistory,
		onlineStake,
		price,
		onlineCount
	};
}
