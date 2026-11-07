import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Source-text pin (there is no DOM runner, TASK-124): the wallet page may navigate only from the
// library's pick event, never from a selectedWallet change. Route synchronization is exercised
// against the real module and stores in routeSync.svelte.test.ts.
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

	test('the pick handler checks the live pin count and parent address', () => {
		expect(source.match(/pinned:\s*get\(pinnedFlows\)\s*>\s*0/g)?.length).toBe(1);
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

test('read-only panels receive the page address and search only navigates', () => {
	expect(source).toMatch(/<WalletRewards\s+pageAddress=\{walletId\}/);
	expect(source).toMatch(/<WalletSearchPage\s+onsubmit=\{searchWallet\}/);
	expect(source).not.toMatch(/selectWallet\s*\(|selectedWallet\.set\s*\(/);
});
