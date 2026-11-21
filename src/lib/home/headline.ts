import { compact, MISSING, usd } from '$lib/ds/format';
import type { Loaded, Price } from '$lib/server/home';

export function finite(value: unknown): number | null {
	if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

export function priceTile(loaded: Loaded<Price>) {
	if (loaded.state === 'error')
		return { state: 'error' as const, value: MISSING, href: '/markets' };
	const { price, change24h, mcap } = loaded.value;
	return {
		state: loaded.state,
		value: usd(price),
		href: '/markets',
		change:
			change24h !== null && Number.isFinite(change24h)
				? { value: change24h, label: '24h' }
				: undefined,
		detail: `24h · mcap ${usd(mcap)}`,
		asOf: loaded.state === 'stale' ? loaded.asOf : undefined
	};
}

/**
 * The value is the current online stake from epoch-detail; the streamed
 * history only draws the sparkline, whose last point is today's partial-day average.
 * Without the epoch value (`current` undefined) the last daily average stands in,
 * and the tile loads until the history arrives.
 */
export function onlineStakeTile(
	current: Loaded<number | null> | undefined,
	history?: Loaded<{ date: string; stake: number }[]>
) {
	const value: Loaded<number | null> | { state: 'loading' } =
		current ??
		(history && history.state !== 'error'
			? { ...history, value: history.value.at(-1)?.stake ?? null }
			: (history ?? { state: 'loading' }));
	if (value.state === 'error')
		return { state: 'error' as const, value: MISSING, href: '/analytics' };
	const trend = history && history.state !== 'error' ? history.value.map((row) => row.stake) : [];
	return {
		state: value.state,
		value: value.state === 'loading' ? MISSING : compact(value.value, 1),
		detail: trend.length ? 'VOI · 30-day daily avg' : 'VOI',
		trend,
		href: '/analytics',
		asOf: value.state === 'stale' ? value.asOf : undefined
	};
}
