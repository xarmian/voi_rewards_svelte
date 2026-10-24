import type { PageLoad } from './$types';
import { get } from 'svelte/store';
import { selectedWallet } from 'avm-wallet-svelte';
import { config } from '$lib/config';

export const load = (async ({ params, fetch, depends }) => {
	depends('wallet:id');

	let parentWalletId: string | null = null;
	if (params.id) {
		// The lockvest indexer can hang; don't let it block the page render.
		try {
			const response = await fetch(`${config.lockvestApiBaseUrl}?contractAddress=${params.id}`, {
				signal: AbortSignal.timeout(5000)
			});
			if (response.ok) {
				const data = await response.json();
				if (data.accounts?.length > 0) {
					parentWalletId = data.accounts[0].global_owner;
				}
			}
		} catch (error) {
			console.error('Lockvest lookup failed:', error);
		}
	}

	const walletId = params.id || get(selectedWallet)?.address || null;

	return {
		walletId,
		parentWalletId
	};
}) satisfies PageLoad;
