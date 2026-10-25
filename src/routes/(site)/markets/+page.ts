import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
	// Read token from URL; support numeric ID or symbol. Default to VOI (id=0).
	const rawToken = url.searchParams.get('token') || '0';

	let ogImageUrl: string | null = null;
	let tokenSymbolResolved = 'VOI';
	let tokenIdResolved: number = 0;
	let tokenInfo: Record<string, unknown> | null = null;

	const fetchJson = async (path: string) => (await fetch(path)).json();
	const fetchTokenAnalytics = async (tokenId: number) => {
		try {
			const anaJson = await fetchJson(`/api/token-analytics?tokenId=${tokenId}`);
			return anaJson?.analytics ? { ...anaJson.analytics, partial: !!anaJson.partial } : null;
		} catch {
			return null;
		}
	};

	// TASK-27: markets and token analytics need only the token id, price history only the symbol.
	// A numeric id starts both id reads at once; a symbol must resolve through token-info first.
	let marketDataPromise: ReturnType<typeof fetchJson>;
	let tokenAnalyticsPromise: ReturnType<typeof fetchTokenAnalytics>;
	if (/^\d+$/.test(rawToken)) {
		tokenIdResolved = parseInt(rawToken, 10);
		marketDataPromise = fetchJson(`/api/markets?tokenId=${tokenIdResolved}`);
		// Observed now so a failure during the token-info await is not an unhandled rejection;
		// Promise.all below still rejects with it.
		marketDataPromise.catch(() => {});
		tokenAnalyticsPromise = fetchTokenAnalytics(tokenIdResolved);
		// Try to get token info via tokenId
		try {
			const imgJson = await fetchJson(`/api/token-info?tokenId=${tokenIdResolved}`);
			tokenInfo = imgJson?.info ?? null;
			ogImageUrl = imgJson?.info?.imageUrl || null;
			tokenSymbolResolved = imgJson?.info?.symbol || 'VOI';
		} catch {}
	} else {
		// Symbol provided - resolve to tokenId via token-info
		tokenSymbolResolved = (rawToken || 'VOI').toUpperCase();
		try {
			const imgJson = await fetchJson(
				`/api/token-info?symbol=${encodeURIComponent(tokenSymbolResolved)}`
			);
			tokenInfo = imgJson?.info ?? null;
			ogImageUrl = imgJson?.info?.imageUrl || null;
			tokenIdResolved = imgJson?.info?.tokenId ?? 0;
			tokenSymbolResolved = imgJson?.info?.symbol || tokenSymbolResolved;
		} catch {}
		marketDataPromise = fetchJson(`/api/markets?tokenId=${tokenIdResolved}`);
		tokenAnalyticsPromise = fetchTokenAnalytics(tokenIdResolved);
	}

	const [marketData, priceHistory, tokenAnalytics] = await Promise.all([
		marketDataPromise,
		fetchJson(`/api/price-history?period=24h&token=${tokenSymbolResolved}`),
		tokenAnalyticsPromise
	]);

	// Fallback: if no markets found, provide token pairs for the UI to list selectable pools
	let tokenPairs: any[] = [];
	if (!marketData?.marketData || marketData.marketData.length === 0) {
		try {
			const pairsJson = await fetchJson(
				`/api/token-pairs?tokenSymbol=${encodeURIComponent(tokenSymbolResolved)}&limit=50`
			);
			tokenPairs = pairsJson?.pairs || [];
		} catch {}
	}

	// Compose page OG/Twitter metadata used by +layout.svelte
	const title = tokenSymbolResolved === 'VOI' ? 'VOI Markets' : `${tokenSymbolResolved} Markets`;
	const description =
		tokenSymbolResolved === 'VOI'
			? 'Track VOI token prices, charts, and market activity across exchanges.'
			: `Live ${tokenSymbolResolved} price, charts, and top trading pools on Voi.`;

	const pageMetaTags = {
		title,
		description,
		imageUrl: ogImageUrl || 'https://voirewards.com/android-chrome-192x192.png',
		siteName: 'Voi Rewards Auditor',
		cardType: 'summary_large_image'
	};

	return {
		...marketData,
		priceHistory,
		tokenPairs,
		tokenAnalytics,
		// Seeds the page's token info so hydration does not refetch /api/token-info (TASK-27)
		tokenInfo,
		pageMetaTags,
		// Return resolved token info for component initialization
		resolvedToken: {
			symbol: tokenSymbolResolved,
			id: tokenIdResolved
		}
	};
};
