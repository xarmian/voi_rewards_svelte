import type { PageLoad } from './$types';

export const load = (async ({ params }) => {
	return {
		walletId: params.id
	};
}) satisfies PageLoad;
