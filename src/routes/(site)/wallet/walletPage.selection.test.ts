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
		expect(source).not.toMatch(/setOnSelectHandler/);
		const handler = source.slice(source.indexOf('function handleAccountPicked'));
		expect(handler.slice(0, handler.indexOf('\n\t}\n'))).toMatch(/pickNavigation\s*\(/);
	});

	test('the one route-to-selection write goes through selectionFromRoute, in initializeWallet only', () => {
		expect(source.match(/selectionFromRoute\s*\(/g)?.length).toBe(1);
		expect(source.match(/selectWallet\s*\(/g)?.length).toBe(1);
		expect(source).not.toMatch(/selectedWallet\.set\s*\(/);
		const update = source.slice(
			source.indexOf('const updateAccountInfo'),
			source.indexOf('async function initializeWallet')
		);
		expect(update.length).toBeGreaterThan(0);
		expect(update).not.toMatch(/selectWallet|selectionFromRoute/);
	});

	test('the pick handler and the route write both check the live pin count', () => {
		expect(source.match(/pinned:\s*get\(pinnedFlows\)\s*>\s*0/g)?.length).toBe(2);
		expect(source).toMatch(/parentAddress:\s*parentWalletId/);
	});

	test('a modal destroyed mid-flow releases its pin from the count', () => {
		for (const name of ['SendTokenModal', 'BridgeModal']) {
			const modal = readFileSync(
				join(here, '..', '..', '..', 'lib', 'component', `${name}.svelte`),
				'utf8'
			);
			expect(modal, name).toMatch(/flow\.dispose\s*\(\)/);
		}
	});

	test('every wallet picker on the page reports its picks to the one handler', () => {
		const pickers = source.match(/<Web3Wallet\b/g)?.length;
		expect(pickers).toBeGreaterThan(0);
		expect(source.match(/onAccountPicked=\{handleAccountPicked\}/g)?.length).toBe(pickers);
	});
});
