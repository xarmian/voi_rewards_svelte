import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
const source = readFileSync(new URL('./BridgeModal.svelte', import.meta.url), 'utf8');
test('losing membership hides new bridge controls without changing direction', () => {
	expect(source).not.toMatch(/!canSignTransactions &&\s*selectedDirection/);
	// With bridging on (BRIDGE_ENABLED), the form and submit still need the signing account.
	expect(source).toMatch(/\{:else if canSignTransactions\}\s*<!-- Bridge Direction Selection/);
	expect(source).toContain('{#if BRIDGE_ENABLED && canSignTransactions}<button');
});
