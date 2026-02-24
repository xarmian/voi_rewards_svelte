import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
	// Read token from URL; support numeric ID or symbol. Default to VOI (id=0).
	const rawToken = url.searchParams.get('token') || '0';

	let ogImageUrl: string | null = null;
	let tokenSymbolResolved = 'VOI';
	let tokenIdResolved: number = 0;

	// If a numeric ID is provided, use it directly
	if (/^\d+$/.test(rawToken)) {
		tokenIdResolved = parseInt(rawToken, 10);
		// Try to get token info via tokenId
		try {
			const imgRes = await fetch(`/api/token-info?tokenId=${tokenIdResolved}`);
			const imgJson = await imgRes.json();
			ogImageUrl = imgJson?.info?.imageUrl || null;
			tokenSymbolResolved = imgJson?.info?.symbol || 'VOI';
		} catch {}
	} else {
		// Symbol provided - resolve to tokenId via token-info
		tokenSymbolResolved = (rawToken || 'VOI').toUpperCase();
		try {
			const imgRes = await fetch(
				`/api/token-info?symbol=${encodeURIComponent(tokenSymbolResolved)}`
			);
			const imgJson = await imgRes.json();
			ogImageUrl = imgJson?.info?.imageUrl || null;
			tokenIdResolved = imgJson?.info?.tokenId ?? 0;
			tokenSymbolResolved = imgJson?.info?.symbol || tokenSymbolResolved;
		} catch {}
	}

	const [marketDataRes, priceHistoryRes] = await Promise.all([
		fetch(`/api/markets?tokenId=${tokenIdResolved}`),
		fetch(`/api/price-history?period=24h&token=${tokenSymbolResolved}`)
	]);

	const marketData = await marketDataRes.json();
	const priceHistory = await priceHistoryRes.json();

	// Fallback: if no markets found, provide token pairs for the UI to list selectable pools
	let tokenPairs: any[] = [];
	let tokenAnalytics: any = null;
	if (!marketData?.marketData || marketData.marketData.length === 0) {
		try {
			const pairsRes = await fetch(
				`/api/token-pairs?tokenSymbol=${encodeURIComponent(tokenSymbolResolved)}&limit=50`
			);
			const pairsJson = await pairsRes.json();
			tokenPairs = pairsJson?.pairs || [];
		} catch {}
	}

	// Fetch token analytics to populate aggregate metrics when markets are sparse
	try {
		const anaRes = await fetch(`/api/token-analytics?tokenId=${tokenIdResolved}`);
		const anaJson = await anaRes.json();
		tokenAnalytics = anaJson?.analytics || null;
	} catch {}

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
		pageMetaTags,
		// Return resolved token info for component initialization
		resolvedToken: {
			symbol: tokenSymbolResolved,
			id: tokenIdResolved
		}
	};
};
