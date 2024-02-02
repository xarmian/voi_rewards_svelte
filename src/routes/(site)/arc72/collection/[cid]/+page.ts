import type { PageLoad } from './$types';

export const load = (async ({ params }) => {
	return {
		contractId: params.cid,
	};
}) satisfies PageLoad;
