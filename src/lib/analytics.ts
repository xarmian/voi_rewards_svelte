// What Google Analytics is told about a page. Wallet routes carry an account address (or a name that
// resolves to one) in the path or query, so they are reported without it.

// Wallet pages also get a fixed title: the document title carries the start and end of the address.
export type AnalyticsPageView = { page_location: string; page_path: string; page_title?: string };

function isWalletPath(pathname: string): boolean {
	return pathname === '/wallet' || pathname.startsWith('/wallet/');
}

export function analyticsPageView(url: URL): AnalyticsPageView {
	if (isWalletPath(url.pathname)) {
		const page_path = url.pathname === '/wallet' ? '/wallet' : '/wallet/:address';
		return { page_location: `${url.origin}${page_path}`, page_path, page_title: 'Wallet' };
	}
	const page_path = `${url.pathname}${url.search}`;
	return { page_location: `${url.origin}${page_path}`, page_path };
}
