import { failed, finite, nonnegative, record, result, type Resource } from '$lib/network/series';

export type Range = '12' | '26' | 'all';
export type Split = { online: number; community: number; ballast: number; eligible: number };
export type EpochRow = {
	epoch: number;
	apr: number | null;
	accounts: number | null;
	inProgress: boolean;
	/** unavailable when the source gave no usable current epoch to compare with. */
	status: 'in progress' | 'completed' | 'unavailable';
	split: Split | null;
};
export type EpochResource = Resource<EpochRow> & {
	current: EpochRow | null;
	previous: EpochRow | null;
};

export function stakeSplit(input: unknown): Split | null {
	const row = record(input);
	const online = nonnegative(row?.online_stake);
	const ballast = nonnegative(row?.ballast_stake);
	const eligible = nonnegative(row?.eligible_online_stake);
	if (
		online === null ||
		online <= 0 ||
		ballast === null ||
		eligible === null ||
		ballast > online ||
		eligible > online
	)
		return null;
	return { online, community: online - ballast, ballast, eligible };
}

export function epochSeries(
	input: unknown,
	previous: EpochResource | undefined,
	receivedAt: number
): EpochResource {
	const data = record(input);
	if (!Array.isArray(data?.epochs) || data?.error) {
		return {
			...failed(previous),
			current: previous?.current ?? null,
			previous: previous?.previous ?? null
		};
	}
	const rows: EpochRow[] = data.epochs
		.flatMap((entry) => {
			const row = record(entry);
			const epoch = row?.epoch_number;
			if (!finite(epoch) || !Number.isInteger(epoch) || epoch <= 0) return [];
			const entryRow: EpochRow = {
				epoch,
				apr: nonnegative(row?.apr),
				accounts: nonnegative(row?.participating_wallets),
				inProgress: epoch === data.current_epoch,
				status: !finite(data.current_epoch)
					? 'unavailable'
					: epoch === data.current_epoch
						? 'in progress'
						: epoch < data.current_epoch
							? 'completed'
							: 'unavailable',
				split: stakeSplit(row)
			};
			return [entryRow];
		})
		.sort((a, b) => a.epoch - b.epoch);
	const current = rows.find((row) => row.inProgress) ?? null;
	// Without a valid current_epoch no row can be called completed or in progress, so the previous-epoch
	// figure stays unavailable rather than possibly naming the epoch still running.
	const completed = rows.filter(
		(row) => finite(data.current_epoch) && !row.inProgress && row.epoch < data.current_epoch
	);
	const spaced = withEpochGaps(rows);
	return {
		...result(
			spaced,
			receivedAt,
			rows.length ? `Epochs ${rows[0].epoch}–${rows.at(-1)!.epoch}` : null,
			rows.length > 0
		),
		current,
		previous: completed.at(-1) ?? null
	};
}
/** An epoch number the source skipped stays as a row with no figures, so the line breaks there. */
function withEpochGaps(rows: EpochRow[]): EpochRow[] {
	if (rows.length < 2) return rows;
	const first = rows[0].epoch;
	const last = rows.at(-1)!.epoch;
	if (last - first > 10_000) return rows;
	const known = new Map(rows.map((row) => [row.epoch, row]));
	const filled: EpochRow[] = [];
	for (let epoch = first; epoch <= last; epoch++) {
		filled.push(
			known.get(epoch) ?? {
				epoch,
				apr: null,
				accounts: null,
				inProgress: false,
				status: 'unavailable' as const,
				split: null
			}
		);
	}
	return filled;
}

export function epochRange(rows: readonly EpochRow[], range: Range): EpochRow[] {
	return range === 'all' ? [...rows] : rows.slice(-Number(range));
}
