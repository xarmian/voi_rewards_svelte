import type { PageLoad } from './$types';
import { get } from 'svelte/store';
import { selectedWallet } from 'avm-wallet-svelte';

export const load = (({ params, data, depends }) => {
	depends('wallet:id');

	const walletId = params.id || get(selectedWallet)?.address || null;

	return {
		...data,
		walletId
	};
}) satisfies PageLoad;
