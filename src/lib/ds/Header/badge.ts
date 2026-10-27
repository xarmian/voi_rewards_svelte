import type { freshness } from '$lib/stores/chainStatus';
import { comma } from '../format';

export function badgeText({
	status,
	round,
	seconds,
	variant,
	epoch
}: {
	status: ReturnType<typeof freshness>;
	round: number | null;
	seconds: number | null;
	variant: 'hero' | 'bar';
	epoch?: number;
}): string {
	if (status.unavailable) return 'chain data unavailable';
	if (status.tone === 'warn') return `data ${comma(status.minutesOld)} min old`;
	if (round === null) return 'Checking chain…';
	if (variant === 'hero') {
		return epoch === undefined
			? `Block ${comma(round)} live`
			: `Epoch ${epoch} live · block ${comma(round)}`;
	}
	return `#${comma(round)} · ${comma(seconds)} s`;
}
