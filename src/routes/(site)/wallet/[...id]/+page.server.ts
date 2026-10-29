import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { isValidAddress } from 'algosdk';
import { getLockContractByAddress } from '$lib/services/lockvest';
import { resolveWalletName } from '$lib/server/walletName';

export const load = (async ({ params, depends, url, fetch }) => {
	depends('wallet:id');

	let parentWalletId: string | null = null;
	if (params.id) {
		const [first, ...segments] = params.id.split('/');
		const rest = segments.join('/');
		if (!isValidAddress(first)) {
			const result = await resolveWalletName(first, fetch);
			if (result.kind === 'address') {
				redirect(307, '/wallet/' + result.address + (rest ? '/' + rest : '') + url.search);
			}
			if (result.kind === 'not-found') {
				error(404, `No wallet found for "${first}"`);
			}
			error(503, 'The enVoi name service is unavailable. Try again in a moment.');
		}

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
