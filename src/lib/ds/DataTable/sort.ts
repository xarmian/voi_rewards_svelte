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
					? a.value - b.value
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
