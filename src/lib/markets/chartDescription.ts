import type { Time } from 'lightweight-charts';

type Value = number | null | undefined;
type LinePoint = { time: Time | number; value?: Value };
type Candle = { time: number; open?: Value; high?: Value; low?: Value; close?: Value };
type Volume = { time: number; value?: Value };

/** The existing OHLCV renderer sorts timestamps and keeps the last duplicate. */
export function displayedByTime<T extends { time: number }>(points: readonly T[]): T[] {
	const byTime = new Map<number, T>();
	for (const point of [...points].sort((a, b) => a.time - b.time)) byTime.set(point.time, point);
	return Array.from(byTime.values());
}

export function chartTimestamp(time: Time | number): string {
	const date =
		typeof time === 'number'
			? new Date(time * 1000)
			: typeof time === 'string'
				? new Date(time)
				: new Date(Date.UTC(time.year, time.month - 1, time.day));
	return Number.isFinite(date.getTime())
		? date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
		: '—';
}
function price(value: Value): string {
	return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(6) : '—';
}
function volume(value: Value): string {
	return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—';
}
function observations(headers: string[], rows: string[][]): string[] {
	return rows.map((row) => headers.map((header, i) => `${header}: ${row[i]}`).join(' · '));
}

/** Line observations intentionally retain the renderer's input order and duplicates. */
export function describeLine(data: readonly LinePoint[], selection: string, period: string) {
	const headers = ['Timestamp (UTC)', 'Price'];
	const rows = data.map((point) => [chartTimestamp(point.time), price(point.value)]);
	return {
		headers,
		rows,
		observations: observations(headers, rows),
		caption: `${selection} · ${period}. Quote unit not stated for this fallback chart.`,
		summary: rows.length
			? `${selection} · ${period}. First price ${rows[0][1]} at ${rows[0][0]}; last price ${rows.at(-1)![1]} at ${rows.at(-1)![0]}. ${rows.length} observations.`
			: `${selection} · ${period}. No observations.`
	};
}

/** Receives exactly the arrays sent to the price and visible volume series. */
export function describeOHLCV(
	data: readonly Candle[],
	volumes: readonly Volume[],
	context: { selection: string; period: string; quote: string }
) {
	const { selection, period: resolution, quote } = context;
	const hasVolume = volumes.length > 0;
	const headers = [
		'Timestamp (UTC)',
		...['Open', 'High', 'Low', 'Close'].map((label) => `${label} (${quote})`),
		...(hasVolume ? [`Volume (${quote})`] : [])
	];
	const byTime = new Map(data.map((point) => [point.time, point]));
	const volumeByTime = new Map(volumes.map((point) => [point.time, point.value]));
	// A supplied volume-only timestamp is also a displayed observation; its prices stay missing.
	const times = [
		...new Set([...data.map((point) => point.time), ...volumes.map((point) => point.time)])
	].sort((a, b) => a - b);
	const rows = times.map((time) => {
		const point = byTime.get(time);
		return [
			chartTimestamp(time),
			price(point?.open),
			price(point?.high),
			price(point?.low),
			price(point?.close),
			...(hasVolume ? [volume(volumeByTime.get(time))] : [])
		];
	});
	const period = {
		open: price(data[0]?.open),
		high: data.length ? price(Math.max(...data.map((point) => point.high ?? NaN))) : '—',
		low: data.length ? price(Math.min(...data.map((point) => point.low ?? NaN))) : '—',
		close: price(data.at(-1)?.close),
		volume:
			hasVolume &&
			volumes.every((point) => typeof point.value === 'number' && Number.isFinite(point.value))
				? volume(volumes.reduce((sum, point) => sum + point.value!, 0))
				: '—'
	};
	return {
		headers,
		rows,
		period,
		observations: observations(headers, rows),
		caption: `${selection} · ${resolution}. Prices in ${quote}${hasVolume ? `; volume in ${quote}` : ''}. Missing values are shown as —.`,
		summary: data.length
			? `${selection} · ${resolution} · ${quote}. ${data.length} data points, from ${chartTimestamp(data[0].time)} to ${chartTimestamp(data.at(-1)!.time)}.`
			: `${selection} · ${resolution} · ${quote}. No observations.`
	};
}
