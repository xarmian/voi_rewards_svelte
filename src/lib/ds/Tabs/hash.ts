export const LEGACY_HASHES: Record<string, string> = {
	portfolio: 'holdings',
	consensus: 'overview',
	proposals: 'overview',
	epochs: 'rewards',
	lockvest: 'contracts'
};
export const WALLET_TABS = ['overview', 'rewards', 'contracts', 'holdings', 'calculator'] as const;
export function resolveHash(
	hash: string,
	ids: readonly string[],
	fallback = 'overview',
	legacy: Readonly<Record<string, string>> = LEGACY_HASHES
): { id: string; replace: string | null } {
	const key = hash.replace(/^#/, '').toLowerCase();
	if (ids.includes(key)) return { id: key, replace: null };
	const mapped = legacy[key];
	if (mapped && ids.includes(mapped)) return { id: mapped, replace: `#${mapped}` };
	return { id: fallback, replace: null };
}
