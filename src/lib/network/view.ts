import { comma as num } from '$lib/ds/format';
import type { DataState } from '$lib/ds/types';
import type { XSpec } from '$lib/ds/charts/types';
import { freshnessText, type Resource } from './series';

// Chart helpers the analytics page and the module's epoch charts share.
export const pct = (value: number) => `${num(value, 2)}%`;
export const available = (
	value: number | null | undefined,
	format: (n: number) => string = String
) => (value == null ? 'Unavailable' : format(value));
export const freshness = (resource: Resource<unknown> | null) =>
	resource ? freshnessText(resource) : undefined;
export function status(
	resource: Resource<unknown> | null,
	busy: boolean,
	values: (number | null)[]
): DataState {
	if (busy) return 'loading';
	if (!resource) return 'error';
	if (resource.status === 'ready' && !values.some((v) => v !== null)) return 'empty';
	return resource.status;
}
export function domain(values: (number | null)[], log = false): [number, number] {
	const finite = values.filter(
		(v): v is number => v !== null && Number.isFinite(v) && (!log || v > 0)
	);
	if (!finite.length) return log ? [1, 10] : [0, 1];
	const max = Math.max(...finite);
	if (!log) return [0, max > 0 ? max * 1.1 : 1];
	const min = Math.min(...finite);
	return [min / 1.05, max * 1.05];
}
export function timeAxis(rows: { date: string }[]): XSpec {
	const start = new Date(`${rows[0]?.date ?? '1970-01-01'}T00:00:00Z`);
	const end = new Date(`${rows.at(-1)?.date ?? '1970-01-02'}T00:00:00Z`);
	return { kind: 'time', domain: [start, end > start ? end : new Date(+start + 86400000)] };
}
