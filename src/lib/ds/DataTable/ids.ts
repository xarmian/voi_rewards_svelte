import { slug } from '../slug';

/** Captions must be unique on a page unless callers supply an explicit id. */
export function tableId(caption: string, id?: string): string {
	return id ?? `ds-table-${slug(caption)}`;
}

/** Row keys must remain unique after slugging. */
export function detailsId(tableId: string, rowKey: string): string {
	return `${tableId}-details-${slug(rowKey)}`;
}
