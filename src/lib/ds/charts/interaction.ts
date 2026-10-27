export function shownMark(hovered: number | null, active: number | null): number | null {
	return hovered ?? active;
}

/** Positions follow the marks' visual order; null means there is no keyboard position yet. */
export function stepMark(
	key: string,
	currentPosition: number | null,
	count: number
): number | null {
	if (!count || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return null;
	if (key === 'Home') return 0;
	if (key === 'End') return count - 1;
	if (currentPosition === null) return key === 'ArrowRight' ? 0 : count - 1;
	return Math.max(0, Math.min(count - 1, currentPosition + (key === 'ArrowRight' ? 1 : -1)));
}
