import type { PageLoad } from './$types';
import { get } from 'svelte/store';
import { selectedWallet } from 'avm-wallet-svelte';
import { getLockContractByAddress } from '$lib/services/lockvest';

export const load = (async ({ params, depends }) => {
	depends('wallet:id');

	let parentWalletId: string | null = null;
	if (params.id) {
		// Don't let a slow lookup block the page render.
		try {
			const contract = await getLockContractByAddress(params.id);
			parentWalletId = contract?.global_owner ?? null;
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
