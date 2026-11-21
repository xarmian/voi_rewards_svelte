import { dataTable, type DateRange } from '../dataTable';
import { getTokensByEpoch } from '$lib/utils';
import { finite } from '$lib/home/headline';
import { bounded } from '$lib/wallet/read';
import type { DataState } from '$lib/ds/types';
import { epochRange } from '../calendar';
import { blocksForEpoch } from '../headline';
import { epochHistory } from '../source';
import type { EpochResponse } from '../table';
import type { WalletEpoch } from './summary';

type EligibleStake = { epoch_number: number; eligible_online_stake: number };

async function readEpoch(
	date: DateRange,
	stake: number | null,
	force: boolean
): Promise<{ value: WalletEpoch; asOf: string }> {
	const [raw, pool] = await Promise.all([
		bounded(dataTable.fetchData(date.id, force)),
		getTokensByEpoch(date.epoch)
	]);
	const rows = raw as EpochResponse;
	if (!Array.isArray(rows?.data) || !Number.isFinite(blocksForEpoch(date.epoch, rows)))
		throw new Error('Epoch rows unavailable');
	const blocks: Record<string, number> = {};
	for (const row of rows.data) {
		const count = finite(row.block_count);
		if (count === null || count < 0 || !row.proposer) throw new Error('Invalid proposer row');
		blocks[row.proposer] = count;
	}
	const range = epochRange(date.epoch);
	const asOf = rows.max_timestamp;
	if (!asOf || !Number.isFinite(Date.parse(asOf))) throw new Error('Epoch timestamp unavailable');
	const progress = Math.max(
		0,
		Math.min(1, (Date.parse(asOf) - range.start.getTime()) / (7 * 86400000))
	);
	return {
		value: {
			epoch: date.epoch,
			networkBlocks: blocksForEpoch(date.epoch, rows),
			onlineStake: stake,
			pool,
			progress,
			blocks
		},
		asOf
	};
}

/**
 * The wallet load's epoch reads. Calling it starts the eligible stake read; the wallet
 * load calls `ranges`, `live` and `history` where it read them before, so the request
 * order is unchanged.
 */
export function startWalletEpochs(force: boolean) {
	const stakes: Promise<EligibleStake[]> = bounded(
		fetch(epochHistory.statsUrl()).then(async (response) => {
			if (!response.ok) throw new Error('Epoch stake unavailable');
			const data: { epochs: EligibleStake[] } = await response.json();
			if (!Array.isArray(data.epochs)) throw new Error('Epoch stake unavailable');
			return data.epochs;
		})
	).catch(() => []);
	return {
		/** The epoch date ranges; an empty list means the wallet's network data is unavailable. */
		ranges: (): Promise<DateRange[]> => bounded(dataTable.fetchDateRanges(force)),
		/** The live epoch's rows, with the eligible stake read settled alongside. */
		async live(dates: DateRange[], stake: number) {
			const [live] = await Promise.all([readEpoch(dates[dates.length - 1], stake, force), stakes]);
			return live;
		},
		/** The 12 epochs before the live one; a failed epoch is left out and marks the set. */
		async history(dates: DateRange[]): Promise<{ history: WalletEpoch[]; state: DataState }> {
			const epochs = await stakes;
			const historical = await Promise.allSettled(
				dates.slice(-13, -1).map(async (date) => {
					const stake = finite(
						epochs.find((epoch) => epoch.epoch_number === date.epoch)?.eligible_online_stake
					);
					if (stake === null || stake <= 0) throw new Error('Historical stake unavailable');
					// /api/epochs eligible_online_stake is already VOI, like account balances.
					// Refresh only bypasses the live epoch cache; completed rows remain cached.
					const result = await readEpoch(date, stake, false);
					// The date range has ended; snapshots can stop before the final instant if there was no block then.
					return { ...result.value, progress: 1 };
				})
			);
			return {
				history: historical.flatMap((result) =>
					result.status === 'fulfilled' ? [result.value] : []
				),
				state: historical.some((result) => result.status === 'rejected') ? 'error' : 'ready'
			};
		}
	};
}
