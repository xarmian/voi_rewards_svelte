export type VoiUsdStatus = 'ok' | 'stale' | 'invalid' | 'unavailable';

export const VOI_USD_MAX_AGE_MS = 60 * 60 * 1000;

export function resolveVoiUsd(
	series: unknown,
	nowMs: number = Date.now(),
	maxAgeMs = VOI_USD_MAX_AGE_MS
): { voiUsd: number | null; status: VoiUsdStatus; asOf: string | null } {
	if (!Array.isArray(series) || series.length === 0) {
		return { voiUsd: null, status: 'unavailable', asOf: null };
	}

	const point = series[series.length - 1];
	const value = Number(point?.value);
	const time = point?.time;
	let timeMs = NaN;
	if (typeof time === 'number') {
		timeMs = time * 1000;
	} else if (typeof time === 'string' && time.trim()) {
		const seconds = Number(time);
		timeMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(time);
	}
	const date = new Date(timeMs);
	const asOf = Number.isFinite(date.getTime()) ? date.toISOString() : null;

	if (!Number.isFinite(value) || value <= 0) {
		return { voiUsd: null, status: 'invalid', asOf };
	}
	// Stale (or undated) keeps the value and flags it: the old code used the last value
	// regardless of age, and nulling it would zero every VOI-quoted pool (TASK-21 r1).
	if (asOf === null || nowMs - timeMs > maxAgeMs) {
		return { voiUsd: value, status: 'stale', asOf };
	}
	if (timeMs - nowMs > 5 * 60 * 1000) {
		return { voiUsd: null, status: 'invalid', asOf };
	}
	return { voiUsd: value, status: 'ok', asOf };
}
