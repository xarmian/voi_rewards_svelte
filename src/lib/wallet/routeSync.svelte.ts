import { browser } from '$app/environment';
import { untrack } from 'svelte';
import { fromStore, get } from 'svelte/store';
import { connectedWallets, selectedWallet, selectWallet } from '$lib/chain/wallet.svelte';
import { pinnedFlows } from '$lib/chain/flowAccount';
import { selectionFromRoute } from '$lib/utils/walletSelection';

export function createWalletRouteSync(
	walletId: () => string,
	parentWalletId: () => string | null,
	updateAccountInfo: (address: string) => Promise<void>
) {
	const connected = fromStore(connectedWallets);
	const selected = fromStore(selectedWallet);

	async function initializeWallet() {
		if (!browser || !walletId()) return;

		try {
			const next = selectionFromRoute({
				routeAddress: walletId(),
				connected: connected.current,
				selected: selected.current,
				pinned: get(pinnedFlows) > 0
			});
			if (next) selectWallet(next);

			// Now load the wallet data
			await updateAccountInfo(parentWalletId() || walletId());
		} catch (error) {
			console.error('Error initializing wallet:', error);
		}
	}

	// Only page changes initialize selection; owner changes reload data. Asynchronous reads of selection and
	// connected wallets must not turn connect/restore notifications into route synchronization.
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
