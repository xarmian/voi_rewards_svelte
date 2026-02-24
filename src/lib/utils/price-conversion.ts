import type { OHLCVData, VolumeData } from '$lib/types/ohlcv.types';

export type VoiUsdPoint = { time: number | string; value: number };

export function convertVoiQuotedCandlesToUsd(
	candles: OHLCVData[],
	voiUsd: VoiUsdPoint[]
): OHLCVData[] {
	if (!candles?.length || !voiUsd?.length) return candles || [];

	const ref = [...voiUsd]
		.map((p) => {
			let t: number;
			if (typeof p.time === 'number') {
				t = p.time;
			} else if (typeof p.time === 'string') {
				if (/^\d+$/.test(p.time)) {
					t = parseInt(p.time, 10);
				} else {
					t = Math.floor(new Date(p.time).getTime() / 1000);
				}
			} else {
				t = 0;
			}
			return { t, v: p.value };
		})
		.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
		.sort((a, b) => a.t - b.t);

	if (!ref.length) return candles;

	let i = 0;
	let cur = ref[0].v;
	return [...candles]
		.sort((a, b) => a.time - b.time)
		.map((c) => {
			while (i + 1 < ref.length && ref[i + 1].t <= c.time) i++;
			cur = ref[i]?.v ?? cur;
			const f = cur; // USD per VOI
			return {
				...c,
				open: c.open * f,
				high: c.high * f,
				low: c.low * f,
				close: c.close * f
			};
		});
}

export function clampCandlesByMAD(candles: OHLCVData[], k = 6): OHLCVData[] {
	if (!candles?.length) return candles || [];
	const o = candles.map((c) => c.open);
	const h = candles.map((c) => c.high);
	const l = candles.map((c) => c.low);
	const cl = candles.map((c) => c.close);
	const oc = clampOutliersMAD(o, k);
	const hc = clampOutliersMAD(h, k);
	const lc = clampOutliersMAD(l, k);
	const cc = clampOutliersMAD(cl, k);
	return candles.map((cd, idx) => ({
		...cd,
		open: oc[idx],
		high: hc[idx],
		low: lc[idx],
		close: cc[idx]
	}));
}

export function convertVoiQuotedVolumesToUsd(
	volumes: VolumeData[],
	voiUsd: VoiUsdPoint[]
): VolumeData[] {
	if (!volumes?.length || !voiUsd?.length) return volumes || [];

	const ref = [...voiUsd]
		.map((p) => {
			let t: number;
			if (typeof p.time === 'number') {
				t = p.time;
			} else if (typeof p.time === 'string') {
				if (/^\d+$/.test(p.time)) {
					t = parseInt(p.time, 10);
				} else {
					t = Math.floor(new Date(p.time).getTime() / 1000);
				}
			} else {
				t = 0;
			}
			return { t, v: p.value };
		})
		.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
		.sort((a, b) => a.t - b.t);

	if (!ref.length) return volumes;

	let i = 0;
	let cur = ref[0].v;
	const sorted = [...volumes].sort((a, b) => a.time - b.time);
	return sorted.map((pt) => {
		while (i + 1 < ref.length && ref[i + 1].t <= pt.time) i++;
		cur = ref[i]?.v ?? cur; // USD per VOI
		return { time: pt.time, value: pt.value * cur, color: pt.color };
	});
}

export function clampOutliersMAD(values: number[], k = 6): number[] {
	if (!values?.length) return values || [];
	const m = median(values);
	const devs = values.map((v) => Math.abs(v - m));
	const mad = median(devs) || 0;
	if (mad === 0) return values;
	const low = m - k * 1.4826 * mad;
	const high = m + k * 1.4826 * mad;
	return values.map((v) => Math.min(high, Math.max(low, v)));
}

function median(arr: number[]): number {
	const a = [...arr].sort((x, y) => x - y);
	const mid = Math.floor(a.length / 2);
	return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
