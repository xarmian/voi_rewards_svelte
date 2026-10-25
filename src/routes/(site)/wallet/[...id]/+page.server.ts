import type { PageServerLoad } from './$types';
import { getLockContractByAddress } from '$lib/services/lockvest';

export const load = (async ({ params, depends }) => {
	depends('wallet:id');

	let parentWalletId: string | null = null;
	if (params.id) {
		// TASK-32: lookup failures must not prevent the wallet page from loading.
		try {
			const contract = await getLockContractByAddress(params.id);
			parentWalletId = contract?.global_owner ?? null;
		} catch (error) {
			console.error('Lockvest lookup failed:', error);
		}
	}

	return { parentWalletId };
}) satisfies PageServerLoad;
