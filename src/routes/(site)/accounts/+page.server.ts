import { fail } from '@sveltejs/kit';
import { ARCHIVED_MESSAGE } from '$lib/server/archive';

export const actions = {
	setPrimaryWallet: () => {
		return fail(410, { error: ARCHIVED_MESSAGE });
	},
	disconnectWallet: () => {
		return fail(410, { error: ARCHIVED_MESSAGE });
	},
	optin: () => {
		return fail(410, { error: ARCHIVED_MESSAGE });
	}
};
