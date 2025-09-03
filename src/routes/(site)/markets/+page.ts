import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
	// Read token from URL; support numeric ID or symbol. Default to VOI.
	const rawToken = url.searchParams.get('token') || 'VOI';

	// Resolve the token for server-side APIs that expect a symbol
	let tokenForApis = rawToken;
	let ogImageUrl: string | null = null;
	let tokenSymbolResolved = 'VOI';
	let tokenIdResolved: number | null = null;

	// If a numeric ID is provided, resolve its symbol via token-pairs
	if (/^\d+$/.test(rawToken)) {
		try {
			const res = await fetch(`/api/token-pairs?tokenId=${rawToken}&limit=1`);
			const data = await res.json();
			if (data?.pairs?.length) {
				const idNum = parseInt(rawToken, 10);
				const pair = data.pairs[0];
				let symbol = pair.baseTokenId === idNum ? pair.baseSymbol : pair.quoteSymbol;
				// Normalize wVOI -> VOI
				if (symbol?.toUpperCase() === 'WVOI') symbol = 'VOI';
				tokenForApis = symbol || 'VOI';
				tokenSymbolResolved = tokenForApis;
				tokenIdResolved = idNum;
			} else {
				tokenForApis = 'VOI';
				tokenSymbolResolved = 'VOI';
			}
		} catch {
			tokenForApis = 'VOI';
			tokenSymbolResolved = 'VOI';
		}
		// Try to get image via tokenId
		try {
			const imgRes = await fetch(`/api/token-info?tokenId=${rawToken}`);
			const imgJson = await imgRes.json();
			ogImageUrl = imgJson?.info?.imageUrl || null;
			// Capture tokenId for analytics if available
			tokenIdResolved = imgJson?.info?.tokenId ?? tokenIdResolved;
		} catch {}
	} else {
		tokenSymbolResolved = (rawToken || 'VOI').toUpperCase();
		// Try to get image via symbol
		try {
			const imgRes = await fetch(
				`/api/token-info?symbol=${encodeURIComponent(tokenSymbolResolved)}`
			);
			const imgJson = await imgRes.json();
			ogImageUrl = imgJson?.info?.imageUrl || null;
			tokenIdResolved = imgJson?.info?.tokenId ?? (tokenSymbolResolved === 'VOI' ? 0 : null);
		} catch {}
	}

	const [marketDataRes, priceHistoryRes] = await Promise.all([
		fetch(`/api/markets?token=${tokenForApis}`),
		fetch(`/api/price-history?period=24h&token=${tokenForApis}`)
	]);

	const marketData = await marketDataRes.json();
	const priceHistory = await priceHistoryRes.json();

	// Fallback: if no markets found, provide token pairs for the UI to list selectable pools
	let tokenPairs: any[] = [];
	let tokenAnalytics: any = null;
	if (!marketData?.marketData || marketData.marketData.length === 0) {
		try {
			const pairsRes = await fetch(`/api/token-pairs?tokenSymbol=${encodeURIComponent(tokenSymbolResolved)}&limit=50`);
			const pairsJson = await pairsRes.json();
			tokenPairs = pairsJson?.pairs || [];
		} catch {}
	}

	// Fetch token analytics to populate aggregate metrics when markets are sparse
	if (tokenIdResolved !== null) {
		try {
			const anaRes = await fetch(`/api/token-analytics?tokenId=${tokenIdResolved}`);
			const anaJson = await anaRes.json();
			tokenAnalytics = anaJson?.analytics || null;
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
		pageMetaTags
	};
};
