// What Google Analytics is told about a page. Wallet routes carry an account address (or a name that
// resolves to one) in the path or query, so they are reported without it.

export type AnalyticsPageView = { page_location: string; page_path: string };

function isWalletPath(pathname: string): boolean {
	return pathname === '/wallet' || pathname.startsWith('/wallet/');
}

export function analyticsPageView(url: URL): AnalyticsPageView {
	if (isWalletPath(url.pathname)) {
		const page_path = url.pathname === '/wallet' ? '/wallet' : '/wallet/:address';
		return { page_location: `${url.origin}${page_path}`, page_path };
	}
	const page_path = `${url.pathname}${url.search}`;
	return { page_location: `${url.origin}${page_path}`, page_path };
}
