import { browser } from '$app/environment';
import { untrack } from 'svelte';
import { fromStore } from 'svelte/store';
import { connectedWallets, selectWallet } from '$lib/chain/wallet.svelte';
import { pinnedFlows } from '$lib/chain/flowAccount';
import { pageAccountState } from '$lib/chain/signerGate';

export function createWalletRouteSync(
	walletId: () => string,
	parentWalletId: () => string | null,
	updateAccountInfo: (address: string) => Promise<void>
) {
	const connected = fromStore(connectedWallets);
	const pins = fromStore(pinnedFlows);
	$effect(function followPageAccount() {
		const state = pageAccountState(walletId(), connected.current);
		const pinned = pins.current > 0;
		if (browser && !pinned && state.state === 'yours') {
			untrack(() => selectWallet(state.signingEntry));
		}
	});

	async function initializeWallet() {
		if (!browser || !walletId()) return;

		try {
			// Now load the wallet data
			await updateAccountInfo(parentWalletId() || walletId());
		} catch (error) {
			console.error('Error initializing wallet:', error);
		}
	}

	// Data loads follow the route and owner independently of wallet connections.
	let previousPage: string | undefined;
	$effect.pre(() => {
		const page = walletId();
		const owner = parentWalletId();
		if (!browser) return;
		if (!page) {
			previousPage = undefined;
			return;
		}
		if (previousPage === page)
			untrack(() => {
				void updateAccountInfo(owner || page);
			});
		else {
			previousPage = page;
			untrack(() => initializeWallet());
		}
	});
}
