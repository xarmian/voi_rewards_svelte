import type { PageLoad } from './$types';

export const load = (({ params, data, depends }) => {
	depends('wallet:id');

	const walletId = params.id || null;

	return {
		...data,
		walletId
	};
}) satisfies PageLoad;
