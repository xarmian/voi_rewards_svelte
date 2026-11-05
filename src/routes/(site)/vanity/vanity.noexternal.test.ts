import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const page = new URL('./+page.svelte', import.meta.url);

test.each([
	page,
	new URL('../../../lib/chain/vanitySearch.ts', import.meta.url),
	new URL('../../../lib/chain/vanity.worker.ts', import.meta.url)
])('%s contains no external code loaders', (file) => {
	const source = readFileSync(file, 'utf8');
	expect(source).not.toMatch(/importScripts/);
	expect(source).not.toMatch(/<script\b[^>]*\bsrc\s*=/i);
	expect(source).not.toMatch(/cdn\.jsdelivr|cdnjs|unpkg|esm\.sh/i);
});

test('constructs the bundled module worker as a complete statement', () => {
	const source = readFileSync(page, 'utf8');
	expect(source).not.toMatch(/new\s+Blob\s*\(|createObjectURL/);
	expect(source).toMatch(/worker\s*=\s*new Worker\(new URL\('\.\.\/\.\.\/\.\.\/lib\/chain\/vanity\.worker\.ts', import\.meta\.url\), \{ type: 'module' \}\);/);
});
