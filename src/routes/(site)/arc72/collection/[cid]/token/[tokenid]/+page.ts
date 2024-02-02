import type { PageLoad } from './$types';

export const load = (async ({ params }) => {
	return {
		contractId: params.cid,
		tokenId: params.tokenid,
	};
}) satisfies PageLoad;
