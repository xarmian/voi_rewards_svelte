import { epochAt, epochRange } from './calendar';
import { blocksForEpoch, deriveHeadline, type Epoch, type Headline } from './headline';
import { epochHistory, type EpochHistorySource } from './source';
import type { EpochResponse } from './table';
import { finite } from '$lib/home/headline';
import { getTokensByEpoch, extrapolateRewardPerBlock } from '$lib/utils';
import type { RewardParams } from '../../stores/dataTable';
import { readEpoch } from '$lib/ds/EpochStepper/url';
import { CRITICAL_TIMEOUT_MS, failure, list, ready, record, type Loaded } from '$lib/server/loaded';

/** The home page's epoch-rewards fields, as the page payload carries them. */
export type EpochHomeData = {
	currentEpoch: number;
	rewardsEpoch: number;
	headline: Loaded<Headline>;
	rewards: Loaded<{ rangeId: string; data: EpochResponse; params: RewardParams }>;
	aprHistory: Loaded<{ epoch: number; apr: number; wallets: number | null }[]>;
	/** The selected epoch's live online stake (epoch-detail), the value /analytics shows. */
	currentStake: Loaded<number | null>;
};
type RewardRows = EpochResponse;
type Read = <T>(
	url: string,
	parse: (value: unknown) => T,
	timeoutMs?: number
) => Promise<Loaded<T>>;

/**
 * Starts every epoch read before it returns (the home load's fetch order depends on it),
 * then resolves to the epoch fields of the home payload.
 */
export function startEpochHome({
	url,
	now,
	startedAt,
	read,
	source = epochHistory
}: {
	url: URL;
	now: Date;
	/** When the page load began; late reads get what is left of the critical deadline. */
	startedAt: number;
	read: Read;
	source?: EpochHistorySource;
}): Promise<EpochHomeData> {
	const requestedEpoch = epochAt(now);
	const rowRequests = new Map<number, Promise<Loaded<RewardRows>>>();
	const fetchRows = (
		epoch: number,
		timeoutMs = CRITICAL_TIMEOUT_MS
	): Promise<Loaded<RewardRows>> => {
		const existing = rowRequests.get(epoch);
		if (existing) return existing;
		if (timeoutMs <= 0) return Promise.resolve(failure('Unable to load epoch rewards.'));
		const request = read(
			source.rowsUrl(epoch),
			(value) => {
				const rows = record(value);
				list(rows.data);
				if (finite(rows.num_blocks) === null) throw new Error('Missing blocks');
				return rows as RewardRows;
			},
			timeoutMs
		);
		rowRequests.set(epoch, request);
		return request;
	};
	// Start all independent critical reads before awaiting any of them.
	const basePromise = read(source.latestUrl(), (value) => {
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
	// Start a shared-link epoch alongside the headline reads, within the same deadline.
	void fetchRows(readEpoch(url, 1, requestedEpoch));
	const previousRowsPromise =
		now.getTime() - epochRange(requestedEpoch).start.getTime() < 24 * 60 * 60 * 1000
			? fetchRows(requestedEpoch - 1)
			: undefined;
	const epochsPromise = read(source.statsUrl(), (value) =>
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
	const rewardsPromise = basePromise.then(async (base) => {
		const current =
			base.state === 'error'
				? requestedEpoch
				: Math.min(requestedEpoch, epochAt(new Date(base.value)));
		const epoch = readEpoch(url, 1, current);
		return { epoch, rows: await fetchRows(epoch, CRITICAL_TIMEOUT_MS - (Date.now() - startedAt)) };
	});
	return finish();

	async function finish(): Promise<EpochHomeData> {
		const [base, selected, epochs, selectedRewards] = await Promise.all([
			basePromise,
			selectedPromise,
			epochsPromise,
			rewardsPromise
		]);
		const { epoch, rows } = selected;
		let rewards: EpochHomeData['rewards'] = failure('Unable to load epoch rewards.');
		if (base.state !== 'error' && selectedRewards.rows.state !== 'error') {
			const range = epochRange(selectedRewards.epoch);
			const pool = await getTokensByEpoch(selectedRewards.epoch);
			const blocks = blocksForEpoch(selectedRewards.epoch, selectedRewards.rows.value);
			const projection = extrapolateRewardPerBlock(blocks, pool, range.id);
			rewards = ready({
				rangeId: range.id,
				data: selectedRewards.rows.value,
				// getTokensByEpoch is async; carry the arithmetic inputs for synchronous SSR.
				params: {
					block_reward_pool: pool,
					total_blocks: blocks,
					reward_per_block: projection.projectedRewardPerBlock,
					total_blocks_projected: projection.projectedTotalBlocks
				}
			});
		}
		let headline: EpochHomeData['headline'] = failure('Unable to load the epoch headline.');
		if (base.state !== 'error' && rows.state !== 'error') {
			const range = epochRange(epoch);
			const pool = await getTokensByEpoch(epoch);
			const blocks = blocksForEpoch(epoch, rows.value);
			const projection = extrapolateRewardPerBlock(blocks, pool, range.id);
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
		// history slot: regate on EPOCH_HISTORY_VIEWABLE when a snapshot source exists.
		const aprHistory: EpochHomeData['aprHistory'] =
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
		// Depends on the epoch stats alone, so a base or rows failure does not hide it.
		const currentStake: EpochHomeData['currentStake'] =
			epochs.state === 'error'
				? epochs
				: ready(epochs.value.find((row) => row.epoch_number === epoch)?.online_stake ?? null);
		return {
			currentEpoch: epoch,
			rewardsEpoch: selectedRewards.epoch,
			headline,
			rewards,
			aprHistory,
			currentStake
		};
	}
}
