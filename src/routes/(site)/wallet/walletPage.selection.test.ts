import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Source-text pin (there is no DOM runner, TASK-124): the wallet page may navigate only from the
// library's pick event, never from a selectedWallet change, and routes every route-to-selection
// write through selectionFromRoute.
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '[...id]', '+page.svelte'), 'utf8');

describe('wallet page selection wiring (TASK-132)', () => {
	test('a library selection change does not navigate: no selectedWallet subscription', () => {
		expect(source).not.toMatch(/selectedWallet\.subscribe\s*\(/);
	});

	test('navigation on a user pick comes from the library pick event through pickNavigation', () => {
		expect(source).toMatch(/setOnSelectHandler\s*\(/);
		expect(source).toMatch(/pickNavigation\s*\(/);
	});

	test('both route-to-selection writes go through selectionFromRoute', () => {
		expect(source.match(/selectionFromRoute\s*\(/g)?.length).toBe(2);
		expect(source).not.toMatch(/selectedWallet\.set\s*\(\s*\{\s*address:\s*(address|walletId)/);
	});

	test('the pick handler is removed again when the page is destroyed', () => {
		expect(source).toMatch(/setOnSelectHandler\s*\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/);
	});
});
