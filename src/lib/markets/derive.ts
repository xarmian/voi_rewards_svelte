type SelectedToken = { symbol: string } | null | undefined;
type PriceMarket = Pick<MarketData, 'price' | 'volume_24h'>;

interface MarketData {
	price: number | null;
	volume_24h: number | null;
	tvl: number | null;
	price_change_percentage_24h: number | null;
	exchange: string;
	pair: string;
	type: string;
	network: string;
	url: string | null;
	pool_url: string | null;
	lastUpdated: Date;
	trading_pair_id: number;
}

export function weightedAveragePrice(realMarketData: PriceMarket[], selectedToken: SelectedToken) {
	if (!Array.isArray(realMarketData) || realMarketData.length === 0) return 0;

	// Filter out obviously wrong prices only for VOI
	let filteredMarkets = realMarketData.filter((m) => m.price != null && m.price > 0);

	// For VOI only, filter out inflated prices
	if ((selectedToken?.symbol || 'VOI') === 'VOI') {
		filteredMarkets = filteredMarkets.filter((m) => m.price! < 0.01); // Allow up to 1 cent for VOI
	}

	const marketsWithPriceAndVolume = filteredMarkets.filter(
		(m) => m.price != null && m.price > 0 && m.volume_24h != null && m.volume_24h > 0
	);

	if (marketsWithPriceAndVolume.length === 0) {
		// If no markets have both price and volume, use any valid prices
		if (filteredMarkets.length > 0) {
			// Use median price to avoid outliers
			const prices = filteredMarkets.map((m) => m.price || 0).sort((a, b) => a - b);
			return prices[Math.floor(prices.length / 2)];
		}
		return 0;
	}

	const totalWeightedPrice = marketsWithPriceAndVolume.reduce(
		(sum: number, market: PriceMarket) => sum + market.price! * market.volume_24h!,
		0
	);

	const totalVolume = marketsWithPriceAndVolume.reduce(
		(sum: number, market: PriceMarket) => sum + market.volume_24h!,
		0
	);

	const price = totalVolume > 0 ? totalWeightedPrice / totalVolume : 0;
	return price;
}

export function displayPrice(
	weightedAveragePrice: number,
	aggregates: { weightedAveragePrice: number } | null | undefined,
	priceHistory: { value: number }[]
) {
	// First try weighted average price from market data
	if (weightedAveragePrice && weightedAveragePrice > 0) {
		return weightedAveragePrice;
	}

	// Then try aggregated price from server
	if (aggregates && aggregates.weightedAveragePrice && aggregates.weightedAveragePrice > 0) {
		return aggregates.weightedAveragePrice;
	}

	// Finally fall back to price history
	if (Array.isArray(priceHistory) && priceHistory.length) {
		const lastPrice = priceHistory[priceHistory.length - 1]?.value;
		if (lastPrice && lastPrice > 0) {
			return lastPrice;
		}
	}

	return 0;
}

export function circulatingMarketCap(
	selectedToken: SelectedToken,
	weightedAveragePrice: number,
	circulatingSupply: { circulatingSupply: number }
) {
	return (selectedToken?.symbol || 'VOI') === 'VOI'
		? weightedAveragePrice * Number(circulatingSupply.circulatingSupply)
		: 0;
}

export function tokenTotalSupplyAdjusted(
	tokenInfo: { totalSupply?: number | null; decimals?: number | null } | null | undefined
) {
	return tokenInfo?.totalSupply != null && tokenInfo?.decimals != null
		? tokenInfo.totalSupply / Math.pow(10, tokenInfo.decimals)
		: null;
}

export function fullyDilutedMarketCap(
	tokenTotalSupplyAdjusted: number | null,
	weightedAveragePrice: number,
	selectedToken: SelectedToken
) {
	return tokenTotalSupplyAdjusted
		? weightedAveragePrice * tokenTotalSupplyAdjusted
		: (selectedToken?.symbol || 'VOI') === 'VOI'
			? weightedAveragePrice * 10_000_000_000
			: 0;
}

export function sortMarkets<T extends object>(
	rows: T[],
	sortColumn: string,
	sortDirection: 'asc' | 'desc'
): T[] {
	return [...rows].sort((a, b) => {
		const aValue = a[sortColumn as keyof typeof a];
		const bValue = b[sortColumn as keyof typeof b];

		if (aValue === null || aValue === undefined) return 1;
		if (bValue === null || bValue === undefined) return -1;

		const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
		return sortDirection === 'asc' ? comparison : -comparison;
	});
}

export function filterMarkets<T extends { pair: string; exchange: string; network: string }>(
	realMarketData: T[],
	query: string
): T[] {
	if (!query.trim()) {
		return realMarketData;
	}

	const searchTerm = query.toLowerCase();
	return realMarketData.filter(
		(market) =>
			market.pair.toLowerCase().includes(searchTerm) ||
			market.exchange.toLowerCase().includes(searchTerm) ||
			market.network.toLowerCase().includes(searchTerm)
	);
}
