import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
	// Extract theme parameter from URL
	const themeParam = url.searchParams.get('theme');

	// Validate theme parameter (only allow 'light' or 'dark')
	const theme = themeParam === 'light' || themeParam === 'dark' ? themeParam : null;

	// Extract OS parameter from URL
	const osParam = url.searchParams.get('os');
	const isIOS = osParam === 'ios';

	return {
		theme,
		isIOS
	};
};
