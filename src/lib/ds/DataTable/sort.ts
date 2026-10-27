import { MISSING } from '../format';
import type { Column, SortState } from './types';

export function sortRows<T>(rows: T[], column: Column<T>, dir: SortState['dir']): T[] {
	const value = column.sortValue;
	if (!value) throw new Error(`Sortable column "${column.key}" requires sortValue.`);
	return rows
		.map((row, index) => ({ row, index, value: value(row) }))
		.sort((a, b) => {
			const aMissing = a.value == null || (typeof a.value === 'number' && Number.isNaN(a.value));
			const bMissing = b.value == null || (typeof b.value === 'number' && Number.isNaN(b.value));
			if (aMissing || bMissing)
				return aMissing === bMissing ? a.index - b.index : aMissing ? 1 : -1;
			const comparison =
				typeof a.value === 'number' && typeof b.value === 'number'
					? a.value < b.value
						? -1
						: a.value > b.value
							? 1
							: 0
					: String(a.value).localeCompare(String(b.value), undefined, {
							numeric: true,
							sensitivity: 'base'
						});
			return (dir === 'asc' ? comparison : -comparison) || a.index - b.index;
		})
		.map(({ row }) => row);
}

export function visibleRows<T>(rows: T[], limit: number | undefined, expanded: boolean): T[] {
	return limit === undefined || expanded ? rows : rows.slice(0, limit);
}

/** "Show more" focus target: the first priority-1 column, which is never display:none (review r1). */
export function focusColumnIndex<T>(columns: Column<T>[]): number {
	return Math.max(
		0,
		columns.findIndex((column) => column.priority === 1)
	);
}

/** Default cell text: missing values (null, undefined, NaN) render as the em dash. */
export function cellText(value: unknown): string {
	return value == null || (typeof value === 'number' && Number.isNaN(value))
		? MISSING
		: String(value);
}
