// Shared number and text formatting (DESIGN-SYSTEM.md §0, DATA.md principle 2: one
// number per idea). Missing or non-finite input renders as an em dash, never as 0,
// so failed data never reads as a real zero.

export const MISSING = '—';

type Num = number | null | undefined;

const isNum = (n: Num): n is number => typeof n === 'number' && Number.isFinite(n);

const fmtCache = new Map<string, Intl.NumberFormat>();
function fmt(min: number, max: number): Intl.NumberFormat {
	const key = `${min}:${max}`;
	let f = fmtCache.get(key);
	if (!f) {
		f = new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
		fmtCache.set(key, f);
	}
	return f;
}

/** Grouped number with up to `d` decimals: 1,234,567.89. */
export function comma(n: Num, d = 0): string {
	return isNum(n) ? fmt(0, d).format(n) : MISSING;
}

const UNITS: [number, string][] = [
	[1e9, 'B'],
	[1e6, 'M'],
	[1e3, 'k']
];

/**
 * Short number with up to `d` decimals: 55.94M, 576.1k, 1.2B. Values under 10,000
 * keep full digits (9,999) because "10.0k" is the first point a suffix saves space.
 */
export function compact(n: Num, d = 2): string {
	if (!isNum(n)) return MISSING;
	const abs = Math.abs(n);
	if (abs < 1e4) return comma(n, d);
	const f = fmt(0, d);
	for (let i = 0; i < UNITS.length; i++) {
		const [size, suffix] = UNITS[i];
		if (abs < size) continue;
		// Rounding can carry into the next unit (999,999 -> "1,000k"); step up instead.
		if (i > 0 && Number(f.format(abs / size).replace(/,/g, '')) >= 1000) {
			const [upSize, upSuffix] = UNITS[i - 1];
			return f.format(n / upSize) + upSuffix;
		}
		return f.format(n / size) + suffix;
	}
	return comma(n, d);
}

/** US dollars: $1,234.56, and 6 decimals under $0.01 ($0.004213). */
export function usd(n: Num): string {
	if (!isNum(n)) return MISSING;
	const abs = Math.abs(n);
	const body = abs !== 0 && abs < 0.01 ? fmt(2, 6).format(abs) : fmt(2, 2).format(abs);
	// Negative values that round to zero would otherwise read "-$0.00".
	return (n < 0 && body !== '0.00' ? '-$' : '$') + body;
}

/** A value already in percent units: pct(16.039) -> "16.04%". */
export function pct(n: Num, d = 2): string {
	return isNum(n) ? fmt(0, d).format(n) + '%' : MISSING;
}

/** Compact relative time: "just now", "42s ago", "5m ago", "3h ago", "2d ago", "in 5m". */
export function ago(
	date: Date | number | string | null | undefined,
	now: number = Date.now()
): string {
	if (date === null || date === undefined || date === '') return MISSING;
	const t = date instanceof Date ? date.getTime() : new Date(date).getTime();
	if (!Number.isFinite(t)) return MISSING;
	const diff = Math.round((now - t) / 1000);
	const s = Math.abs(diff);
	if (s < 5) return 'just now';
	let v: string;
	if (s < 60) v = `${s}s`;
	else if (s < 3600) v = `${Math.floor(s / 60)}m`;
	else if (s < 86400) v = `${Math.floor(s / 3600)}h`;
	else v = `${Math.floor(s / 86400)}d`;
	return diff < 0 ? `in ${v}` : `${v} ago`;
}

/** Shortened address: G3MSA7…UIFQ. Short strings pass through unchanged. */
export function shortAddr(a: string | null | undefined, head = 6, tail = 4): string {
	if (!a) return MISSING;
	return a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;
}
