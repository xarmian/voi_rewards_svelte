import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
const source = readFileSync(new URL('./BridgeModal.svelte', import.meta.url), 'utf8');
test('losing membership hides new bridge controls without changing direction', () => {
	expect(source).not.toMatch(/!canSignTransactions &&\s*selectedDirection/);
	expect(source).toMatch(/\{#if canSignTransactions\}[\s\S]*?Bridge Direction Selection/);
	expect(source).toContain('{#if canSignTransactions}<button');
});
