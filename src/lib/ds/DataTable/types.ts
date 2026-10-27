import type { Snippet } from 'svelte';

export type Column<T> = {
	key: string;
	header: string;
	align?: 'start' | 'end';
	numeric?: boolean;
	sortable?: boolean;
	/** Required when sortable is true. Missing values sort last in either direction. */
	sortValue?: (row: T) => number | string | null | undefined;
	priority: 1 | 2 | 3;
	/** Defaults to String(row[key]). Supply a snippet to format missing or numeric values. */
	cell?: Snippet<[T]>;
	width?: string;
};
export type SortState = { key: string; dir: 'asc' | 'desc' };
