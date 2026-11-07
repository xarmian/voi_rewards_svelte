import { afterEach, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { get } from 'svelte/store';

const environment = vi.hoisted(() => ({ browser: true }));
vi.mock('$app/environment', () => environment);
vi.hoisted(() => {
	const values = new Map<string, string>();
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => void values.set(key, value),
			removeItem: (key: string) => void values.delete(key)
		}
	});
});
// Spy on the writer without replacing its implementation or either real store.
vi.mock('$lib/chain/wallet.svelte', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/chain/wallet.svelte')>();
	return { ...actual, selectWallet: vi.fn(actual.selectWallet) };
});
import { walletStore } from 'avm-wallet-svelte';
import { connectedWallets, selectedWallet, selectWallet } from '$lib/chain/wallet.svelte';
import { pinnedFlows } from '$lib/chain/flowAccount';
import { createWalletRouteSync } from './routeSync.svelte';

const A = {
	address: 'A'.repeat(58),
	walletId: 'kibisis' as const,
	authenticated: false,
	isWatch: false
};
const B = { ...A, address: 'B'.repeat(58) };
const C = { ...A, address: 'C'.repeat(58) };
let dispose: (() => void) | undefined;
afterEach(() => {
	dispose?.();
	dispose = undefined;
	walletStore.reset();
	pinnedFlows.set(0);
	environment.browser = true;
	flushSync();
	vi.clearAllMocks();
});

it('syncs once per wallet route change and loads the current parent', () => {
	walletStore.addAccounts([A, B]);
	walletStore.selectAccount(B);
	let walletId = $state(A.address);
	let parentWalletId = $state<string | null>(null);
	const load = vi.fn<(address: string) => Promise<void>>(async () => {});
	dispose = $effect.root(() => {
		createWalletRouteSync(
			() => walletId,
			() => parentWalletId,
			load
		);
	});
	flushSync();
	expect(selectWallet).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ address: A.address })
	);
	expect(load).toHaveBeenCalledExactlyOnceWith(A.address);
	parentWalletId = 'OWNER';
	flushSync();
	// Ownership invalidation reloads the source without selecting an account again.
	expect(load).toHaveBeenCalledTimes(2);
	expect(selectWallet).toHaveBeenCalledTimes(1);
	walletId = B.address;
	flushSync();
	expect(selectWallet).toHaveBeenCalledTimes(2);
	expect(selectWallet).toHaveBeenLastCalledWith(expect.objectContaining({ address: B.address }));
	expect(get(selectedWallet)?.address).toBe(B.address);
	expect(load.mock.calls).toEqual([[A.address], ['OWNER'], ['OWNER']]);
	walletId = '';
	flushSync();
	expect(load).toHaveBeenCalledTimes(3);
	parentWalletId = null;
	walletId = 'UNCONNECTED';
	flushSync();
	expect(get(selectedWallet)?.address).toBe(B.address);
	expect(selectWallet).toHaveBeenCalledTimes(2);
	expect(load).toHaveBeenCalledTimes(4);
	expect(load).toHaveBeenLastCalledWith('UNCONNECTED');
});

it('does not resync or reload on restore/connect notifications and preserves a user selection', () => {
	walletStore.addAccounts([A, B]);
	walletStore.selectAccount(B);
	let walletId = $state(A.address);
	const load = vi.fn<(address: string) => Promise<void>>(async () => {});
	const connectedNotifications = vi.fn();
	const selectionNotifications = vi.fn();
	const stopConnected = connectedWallets.subscribe(connectedNotifications);
	const stopSelected = selectedWallet.subscribe(selectionNotifications);
	try {
		dispose = $effect.root(() => {
			createWalletRouteSync(
				() => walletId,
				() => null,
				load
			);
		});
		flushSync();
		walletId = B.address;
		flushSync();
		expect.soft(selectWallet).toHaveBeenCalledTimes(2);
		expect.soft(load).toHaveBeenCalledTimes(2);
		// The picker selects A while the displayed route is still B.
		walletStore.selectAccount(A);
		flushSync();
		expect.soft(get(selectedWallet)?.address).toBe(A.address);
		expect.soft(selectWallet).toHaveBeenCalledTimes(2);
		expect.soft(load).toHaveBeenCalledTimes(2);
		connectedNotifications.mockClear();
		selectionNotifications.mockClear();
		// Restore/connect publishes both a new account and updated selected-account metadata.
		walletStore.addAccounts([C]);
		walletStore.updateAccountName(A.address, 'Restored account');
		flushSync();
		expect.soft(connectedNotifications).toHaveBeenCalled();
		expect.soft(selectionNotifications).toHaveBeenCalled();
		expect.soft(get(connectedWallets).map((account) => account.address)).toContain(C.address);
		expect
			.soft(get(selectedWallet))
			.toMatchObject({ address: A.address, name: 'Restored account' });
		expect.soft(selectWallet).toHaveBeenCalledTimes(2);
		expect.soft(load).toHaveBeenCalledTimes(2);
	} finally {
		stopConnected();
		stopSelected();
	}
});

it('keeps a pinned selection on route changes and still loads the route', () => {
	walletStore.addAccounts([A, B]);
	walletStore.selectAccount(B);
	pinnedFlows.set(1);
	const load = vi.fn<(address: string) => Promise<void>>(async () => {});
	dispose = $effect.root(() => {
		createWalletRouteSync(
			() => A.address,
			() => null,
			load
		);
	});
	flushSync();
	expect(get(selectedWallet)?.address).toBe(B.address);
	expect(selectWallet).not.toHaveBeenCalled();
	expect(load).toHaveBeenCalledExactlyOnceWith(A.address);
	pinnedFlows.set(0);
	flushSync();
	expect(get(selectedWallet)?.address).toBe(B.address);
	expect(selectWallet).not.toHaveBeenCalled();
	expect(load).toHaveBeenCalledTimes(1);
});

it('does not select or load outside the browser', () => {
	environment.browser = false;
	walletStore.addAccounts([A]);
	const load = vi.fn<(address: string) => Promise<void>>(async () => {});
	dispose = $effect.root(() => {
		createWalletRouteSync(
			() => A.address,
			() => null,
			load
		);
	});
	flushSync();
	expect(selectWallet).not.toHaveBeenCalled();
	expect(load).not.toHaveBeenCalled();
});
