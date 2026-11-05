import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';

// The library persists selection to localStorage in the browser build. Node has none, and the repo
// carries no DOM environment, so give it an in-memory one before the library loads.
vi.hoisted(() => {
	const data = new Map<string, string>();
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: {
			getItem: (key: string) => data.get(key) ?? null,
			setItem: (key: string, value: string) => void data.set(key, String(value)),
			removeItem: (key: string) => void data.delete(key),
			clear: () => data.clear()
		}
	});
});
import { get } from 'svelte/store';
import { walletStore } from 'avm-wallet-svelte';
import {
	captureSigner,
	connectedWallets,
	selectWallet,
	selectedWallet,
	type Wallet
} from './wallet.svelte';

const A = 'A'.repeat(58);
const B = 'B'.repeat(58);

function account(address: string, walletId: 'pera' | 'defly' | 'watch', name?: string) {
	return { address, walletId, authenticated: false, isWatch: walletId === 'watch', name };
}

// The seam keeps the 0.9 read shape: `app` is '' while a selection has no wallet, 'Watch' for
// watch-only accounts, and otherwise the wallet id. walletId rides along for the signer.
describe('wallet seam', () => {
	let unsubscribers: Array<() => void> = [];
	const seen: Array<Wallet | null> = [];

	beforeEach(() => {
		walletStore.reset();
		seen.length = 0;
		unsubscribers = [selectedWallet.subscribe((w) => seen.push(w))];
		flushSync();
	});

	afterEach(() => {
		for (const stop of unsubscribers) stop();
		walletStore.reset();
	});

	it('is null with no accounts', () => {
		expect(get(selectedWallet)).toBeNull();
		expect(get(connectedWallets)).toEqual([]);
	});

	it('maps the selected account to the legacy shape', () => {
		walletStore.addAccounts([account(A, 'pera', 'alice')]);
		walletStore.selectAccount(account(A, 'pera', 'alice'));
		flushSync();
		expect(get(selectedWallet)).toMatchObject({ address: A, app: 'pera', walletId: 'pera' });
	});

	it("reports watch-only accounts as app 'Watch'", () => {
		walletStore.addAccounts([account(A, 'watch')]);
		walletStore.selectAccount(account(A, 'watch'));
		flushSync();
		expect(get(selectedWallet)).toMatchObject({ address: A, app: 'Watch', walletId: 'watch' });
	});

	it('lists every connected account, one entry per (address, wallet) pair', () => {
		walletStore.addAccounts([account(A, 'pera'), account(A, 'defly'), account(B, 'pera')]);
		flushSync();
		const pairs = get(connectedWallets).map((w) => `${w.address}:${w.walletId}`);
		expect(pairs).toEqual([`${A}:pera`, `${A}:defly`, `${B}:pera`]);
	});

	it('does not re-emit the selection when an unrelated account changes', () => {
		walletStore.addAccounts([account(A, 'pera'), account(B, 'pera')]);
		walletStore.selectAccount(account(A, 'pera'));
		flushSync();
		const before = seen.length;
		walletStore.updateAccountName(B, 'bob');
		flushSync();
		expect(seen.length).toBe(before);
	});

	it('does not re-emit when only a field the legacy shape ignores changes', () => {
		walletStore.addAccounts([account(A, 'pera')]);
		walletStore.selectAccount(account(A, 'pera'));
		flushSync();
		const listed: Wallet[][] = [];
		unsubscribers.push(connectedWallets.subscribe((list) => listed.push(list)));
		flushSync();
		const before = { selected: seen.length, listed: listed.length };
		// Signing in flips `authenticated`. That re-runs the effects, and only the equality check
		// keeps both stores quiet, because address, wallet, app and name are unchanged.
		walletStore.setAuthenticated('pera', A, 'token');
		flushSync();
		expect(walletStore.accounts[0]?.authenticated).toBe(true);
		expect(seen.length).toBe(before.selected);
		expect(listed.length).toBe(before.listed);
	});

	it('re-emits when the selected account itself is renamed', () => {
		walletStore.addAccounts([account(A, 'pera')]);
		walletStore.selectAccount(account(A, 'pera'));
		flushSync();
		const before = seen.length;
		walletStore.updateAccountName(A, 'alice');
		flushSync();
		expect(seen.length).toBe(before + 1);
		expect(seen.at(-1)).toMatchObject({ address: A, name: 'alice' });
	});

	it('selectWallet selects the exact (address, wallet) pair, not the first address match', () => {
		walletStore.addAccounts([account(A, 'pera'), account(A, 'defly')]);
		flushSync();
		const second = get(connectedWallets).find((w) => w.walletId === 'defly') as Wallet;
		selectWallet(second);
		flushSync();
		expect(get(selectedWallet)).toMatchObject({ address: A, walletId: 'defly' });
	});

	it('selectWallet ignores a pair that is not connected', () => {
		walletStore.addAccounts([account(A, 'pera')]);
		walletStore.selectAccount(account(A, 'pera'));
		flushSync();
		selectWallet({ address: B, app: 'pera', walletId: 'pera' });
		flushSync();
		expect(get(selectedWallet)).toMatchObject({ address: A });
	});

	describe('captureSigner', () => {
		it('returns an immutable { address, walletId } copy of the current selection', () => {
			walletStore.addAccounts([account(A, 'pera')]);
			walletStore.selectAccount(account(A, 'pera'));
			flushSync();
			const signer = captureSigner();
			expect(signer).toEqual({ address: A, walletId: 'pera' });
			expect(Object.isFrozen(signer)).toBe(true);
		});

		it('keeps the captured account when the selection later changes', () => {
			walletStore.addAccounts([account(A, 'pera'), account(B, 'pera')]);
			walletStore.selectAccount(account(A, 'pera'));
			flushSync();
			const signer = captureSigner();
			walletStore.selectAccount(account(B, 'pera'));
			flushSync();
			expect(signer.address).toBe(A);
		});

		it('throws with no selection', () => {
			expect(() => captureSigner()).toThrow(/no account/i);
		});

		it('throws for a watch-only selection', () => {
			walletStore.addAccounts([account(A, 'watch')]);
			walletStore.selectAccount(account(A, 'watch'));
			flushSync();
			expect(() => captureSigner()).toThrow(/watch/i);
		});
	});
});
