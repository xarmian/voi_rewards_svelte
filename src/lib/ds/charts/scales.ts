import { scaleBand, scaleLinear, scaleUtc } from 'd3-scale';
import type { XSpec } from './types';
type XValue = number | string | Date;
export function makeX(spec: XSpec, range: [number, number]) {
	if (spec.kind === 'band') {
		const scale = scaleBand<number | string>().domain(spec.values).range(range).paddingInner(0.25);
		return {
			position: (v: XValue) => (v instanceof Date ? NaN : (scale(v) ?? NaN)),
			bandwidth: scale.bandwidth(),
			contains: (v: XValue) => !(v instanceof Date) && spec.values.includes(v),
			ticks: () => scale.domain()
		};
	}
	const numeric = (v: XValue) =>
		spec.kind === 'time' ? +(v instanceof Date ? v : new Date(v)) : Number(v);
	const scale =
		spec.kind === 'time'
			? scaleUtc().domain(spec.domain).range(range)
			: scaleLinear().domain(spec.domain).range(range);
	const ends = spec.domain.map(Number);
	return {
		position: (v: XValue) => scale(numeric(v)),
		bandwidth: 0,
		contains: (v: XValue) => {
			const n = numeric(v);
			return Number.isFinite(n) && n >= Math.min(...ends) && n <= Math.max(...ends);
		},
		ticks: (count: number) => scale.ticks(count)
	};
}
export function makeY(domain: [number, number], range: [number, number]) {
	return scaleLinear().domain(domain).range(range).nice();
}
/** D3's tick count is a hint; the final filter guarantees 44 physical pixels. */
export function tickValues(x: ReturnType<typeof makeX>, width: number): XValue[] {
	const candidates = x.ticks(Math.max(1, Math.floor(width / 44)));
	const result: XValue[] = [];
	let last = -Infinity;
	for (const value of candidates) {
		const position = x.position(value);
		if (Number.isFinite(position) && position - last >= 44 - 1e-8) {
			result.push(value);
			last = position;
		}
	}
	return result;
}
