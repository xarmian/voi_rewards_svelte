import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
	// Extract OS parameter from URL
	const osParam = url.searchParams.get('os');
	const isIOS = osParam === 'ios';

	return {
		isIOS
	};
};
