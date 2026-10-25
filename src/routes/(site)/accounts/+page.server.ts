import { error } from '@sveltejs/kit';
import { ARCHIVED_MESSAGE } from '$lib/server/archive';

// error(), not fail(): a fail() reaches fetch clients as HTTP 200 with type 'failure' (TASK-16 r1).
const archived = () => error(410, ARCHIVED_MESSAGE);

export const actions = {
	setPrimaryWallet: archived,
	disconnectWallet: archived,
	optin: archived
};
