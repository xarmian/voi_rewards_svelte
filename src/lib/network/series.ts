export type Resource<T> = {
	status: 'ready' | 'stale' | 'error' | 'empty';
	rows: T[];
	receivedAt: number | null;
	coverage: string | null;
	asOf: { kind: 'observed' | 'retrieved'; time: number | null };
};
export type Range = '12' | '26' | 'all';
export type Period = 'day' | 'week';
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
export type DailyRow = { date: string; value: number | null };
export type TransactionRow = { date: string; actual: number | null; projected: number | null };

const dayMs = 86_400_000;
const record = (value: unknown): Record<string, unknown> | null =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
const finite = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): number | null => (finite(value) && value >= 0 ? value : null);

export function timestamp(value: unknown): number | null {
	const time = finite(value)
		? Math.abs(value) < 1e12
			? value * 1000
			: value
		: typeof value === 'string' && /^\d{4}-\d\d-\d\d(?:T|$)/.test(value)
			? Date.parse(/T\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value)
			: NaN;
	return Number.isFinite(time) && Number.isFinite(new Date(time).getTime()) ? time : null;
}
const dateOf = (time: number) => new Date(time).toISOString().slice(0, 10);
const midnight = (time: number) => Math.floor(time / dayMs) * dayMs;

function failed<T>(previous: Resource<T> | undefined): Resource<T> {
	return previous &&
		previous.rows.length &&
		previous.receivedAt !== null &&
		(previous.status === 'ready' || previous.status === 'stale')
		? { ...previous, status: 'stale' }
		: {
				status: 'error',
				rows: [],
				receivedAt: null,
				coverage: null,
				asOf: { kind: 'retrieved', time: null }
			};
}
function result<T>(
	rows: T[],
	receivedAt: number,
	coverage: string | null,
	available: boolean,
	observed?: number | null
): Resource<T> {
	return {
		status: available ? 'ready' : 'empty',
		rows,
		receivedAt,
		coverage,
		// Without a source observation time the card says when it was retrieved, never "unavailable".
		asOf:
			observed == null
				? { kind: 'retrieved', time: receivedAt }
				: { kind: 'observed', time: observed }
	};
}

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

function calendar(start: number, end: number, values: Map<string, number>): DailyRow[] {
	const rows: DailyRow[] = [];
	for (let time = start; time <= end; time += dayMs) {
		const date = dateOf(time);
		rows.push({ date, value: values.get(date) ?? null });
	}
	return rows;
}
const dailyCoverage = (rows: DailyRow[]) =>
	rows.length ? `${rows[0].date}–${rows.at(-1)!.date} UTC` : null;

export function stakeSeries(
	input: unknown,
	previous: Resource<DailyRow> | undefined,
	receivedAt: number
): Resource<DailyRow> {
	if (!Array.isArray(input)) return failed(previous);
	const values = new Map<string, number>();
	let observed: number | null = null;
	const end = midnight(receivedAt);
	const start = end - 29 * dayMs;
	for (const entry of input) {
		const row = record(entry);
		const time = timestamp(row?.date);
		if (time === null || time < start || time > end) continue;
		const value = nonnegative(row?.avg_online_stake);
		if (value !== null) values.set(dateOf(time), value / 1e6);
		const sourceTime = timestamp(row?.max_timestamp);
		if (sourceTime !== null) observed = Math.max(observed ?? sourceTime, sourceTime);
	}
	const rows = calendar(start, end, values);
	return result(rows, receivedAt, dailyCoverage(rows), values.size > 0, observed);
}

export function priceSeries(
	input: unknown,
	previous: Resource<DailyRow> | undefined,
	receivedAt: number
): Resource<DailyRow> {
	if (!Array.isArray(input)) return failed(previous);
	const buckets = new Map<string, number[]>();
	let first: number | null = null;
	let last: number | null = null;
	let observed: number | null = null;
	for (const entry of input) {
		const row = record(entry);
		const time = timestamp(row?.time);
		if (time === null) continue;
		const date = dateOf(time);
		first = Math.min(first ?? time, time);
		last = Math.max(last ?? time, time);
		observed = last;
		if (finite(row?.value) && row.value > 0) {
			const values = buckets.get(date) ?? [];
			values.push(row.value);
			buckets.set(date, values);
		}
	}
	const means = new Map<string, number>();
	for (const [date, values] of buckets) {
		const mean = values.reduce((sum, value) => sum + value / values.length, 0);
		if (Number.isFinite(mean) && mean > 0) means.set(date, mean);
	}
	const rows =
		first === null || last === null ? [] : calendar(midnight(first), midnight(last), means);
	return result(rows, receivedAt, dailyCoverage(rows), means.size > 0, observed);
}

export function transactionSeries(
	input: unknown,
	previous: Resource<TransactionRow> | undefined,
	receivedAt: number,
	period: Period
): Resource<TransactionRow> {
	const data = record(input);
	if (!Array.isArray(data?.data) || data?.error) return failed(previous);
	const duration = (period === 'day' ? 1 : 7) * dayMs;
	const rows: TransactionRow[] = data.data
		.flatMap((entry) => {
			const row = record(entry);
			const time = timestamp(row?.bucket_start);
			const actual = nonnegative(row?.tx_count);
			if (time === null || actual === null) return [];
			const elapsed = receivedAt - time;
			const projection =
				elapsed > 0 && elapsed < duration ? Math.round((actual * duration) / elapsed) : null;
			return [
				{
					date: dateOf(time),
					actual,
					projected: projection !== null && Number.isFinite(projection) ? projection : null
				}
			];
		})
		.sort((a, b) => a.date.localeCompare(b.date));
	const filled = withGaps(rows, duration);
	return result(
		filled,
		receivedAt,
		filled.length ? `${filled[0].date}–${filled.at(-1)!.date} UTC` : null,
		rows.length > 0
	);
}

/**
 * A bucket the source did not return is unavailable, not zero and not absent: the row stays, with no
 * count, so the line breaks there and the table says so. A real zero count keeps its own row.
 */
function withGaps(rows: TransactionRow[], step: number): TransactionRow[] {
	if (rows.length < 2) return rows;
	const known = new Map(rows.map((row) => [row.date, row]));
	const filled: TransactionRow[] = [];
	const end = Date.parse(`${rows.at(-1)!.date}T00:00:00Z`);
	for (let time = Date.parse(`${rows[0].date}T00:00:00Z`); time <= end; time += step) {
		const date = dateOf(time);
		filled.push(known.get(date) ?? { date, actual: null, projected: null });
	}
	// Buckets off the expected grid (not one step apart) are kept as received rather than dropped.
	return filled.filter((row) => row.actual !== null).length === rows.length ? filled : rows;
}

export function freshnessText(resource: Resource<unknown>): string {
	const { time, kind } = resource.asOf;
	const absolute =
		time === null
			? 'unavailable'
			: new Date(time)
					.toISOString()
					.replace('T', ' ')
					.replace(/\.\d{3}Z$/, ' UTC');
	return `${kind === 'retrieved' ? `Retrieved ${absolute} - source update time unavailable` : `data as of ${absolute}`}${resource.coverage ? ` · ${resource.coverage}` : ''}`;
}
