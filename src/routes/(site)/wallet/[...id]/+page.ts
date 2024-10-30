import type { PageLoad } from './$types';
import { get } from 'svelte/store';
import { selectedWallet } from 'avm-wallet-svelte';
import { config } from '$lib/config';
export const load = (async ({ params, fetch }) => {
	let parentWalletId: string | null = null;
	if (params.id) {
		// check if address is a contract address
		const response = await fetch(`${config.lockvestApiBaseUrl}?contractAddress=${params.id}`);
		if (response.ok) {
			const data = await response.json();
			if (data.accounts.length > 0) {
				parentWalletId = data.accounts[0].global_owner;
			}
		}
	}
	
	const walletId = params.id || get(selectedWallet)?.address || null;

	return {
		walletId,
		parentWalletId
	};
}) satisfies PageLoad;
