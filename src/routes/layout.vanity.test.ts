import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('the complete analytics condition excludes vanity and its subpaths', () => {
	const source = readFileSync(new URL('./+layout.svelte', import.meta.url), 'utf8');
	expect(source).toMatch(/const isVanity = pathname === '\/vanity' \|\| pathname\.startsWith\('\/vanity\/'\);/);
	expect(source).toMatch(/if\s*\(typeof window !== 'undefined' && !isDiscover && !isVanity\)\s*\{/);
});
