export function classify(value: number, expected: number): 'hi' | 'warn' | null {
	if (!Number.isFinite(value) || !Number.isFinite(expected) || expected <= 0) return null;
	const ratio = value / expected;
	return ratio > 1.15 ? 'hi' : ratio < 0.85 ? 'warn' : null;
}
export function ratioLabel(value: number, expected: number): string {
	return `${Math.round((value / expected) * 100)}%`;
}
