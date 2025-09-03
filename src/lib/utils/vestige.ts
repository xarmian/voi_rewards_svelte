// Vestige API integration utilities
// API Documentation: https://api.vestigelabs.org

export interface VestigePool {
	id: number;
	network_id: number;
	protocol_id: number;
	created_at: number;
	updated_at: number;
	address: string;
	application_id: number;
	fee: number;
	token_id: number;
	token_supply: number;
	asset_1_id: number;
	asset_1_supply: number;
	asset_2_id: number;
	asset_2_supply: number;
}

export interface VestigeAsset {
	network_id: number;
	id: number;
	created_at: number;
	updated_at: number;
	name: string;
	ticker: string;
	decimals: number;
	creator: string;
	manager: string;
	reserve: string;
	clawback: string;
	freeze: string;
	url: string;
	total_supply: number;
}

export interface VestigeProtocol {
	id: number;
	active: boolean;
	name: string;
	type: number;
	version: string;
	url: string;
	tvl: number;
}

interface VestigePoolsResponse {
	count: number;
	results: VestigePool[];
}

interface VestigeAssetsResponse extends Array<VestigeAsset> {}

interface VestigeProtocolsResponse extends Array<VestigeProtocol> {}

// Cache for protocols to avoid repeated API calls
let protocolsCache: VestigeProtocol[] | null = null;

const VESTIGE_API_BASE = 'https://api.vestigelabs.org';
const NETWORK_ID = 0; // Algorand mainnet

/**
 * Fetch all protocols from Vestige API
 */
export async function fetchVestigeProtocols(): Promise<VestigeProtocol[]> {
	if (protocolsCache) {
		return protocolsCache;
	}

	try {
		const response = await fetch(`${VESTIGE_API_BASE}/protocols?network_id=${NETWORK_ID}`);
		if (!response.ok) {
			throw new Error(`Vestige protocols API error: ${response.status}`);
		}
		
		const protocols: VestigeProtocolsResponse = await response.json();
		protocolsCache = protocols;
		return protocols;
	} catch (error) {
		console.error('Error fetching Vestige protocols:', error);
		return [];
	}
}

/**
 * Fetch pools where the asset is either asset_1 or asset_2
 */
export async function fetchVestigePoolsByAsset(assetId: number): Promise<VestigePool[]> {
	try {
		const [pools1Response, pools2Response] = await Promise.allSettled([
			fetch(`${VESTIGE_API_BASE}/pools?network_id=${NETWORK_ID}&asset_1_id=${assetId}&limit=50&offset=0&order_dir=desc`),
			fetch(`${VESTIGE_API_BASE}/pools?network_id=${NETWORK_ID}&asset_2_id=${assetId}&limit=50&offset=0&order_dir=desc`)
		]);

		const pools: VestigePool[] = [];

		// Process pools where asset is asset_1
		if (pools1Response.status === 'fulfilled' && pools1Response.value.ok) {
			const data: VestigePoolsResponse = await pools1Response.value.json();
			pools.push(...data.results);
		}

		// Process pools where asset is asset_2
		if (pools2Response.status === 'fulfilled' && pools2Response.value.ok) {
			const data: VestigePoolsResponse = await pools2Response.value.json();
			pools.push(...data.results);
		}

		// Remove duplicates (in case a pool appears in both responses)
		const uniquePools = pools.filter((pool, index, self) => 
			index === self.findIndex(p => p.id === pool.id)
		);

		return uniquePools;
	} catch (error) {
		console.error('Error fetching Vestige pools:', error);
		return [];
	}
}

/**
 * Fetch asset details for multiple asset IDs
 */
export async function fetchVestigeAssets(assetIds: number[]): Promise<VestigeAsset[]> {
	if (assetIds.length === 0) return [];

	try {
		const idsParam = assetIds.join(',');
		const response = await fetch(`${VESTIGE_API_BASE}/assets?asset_ids=${idsParam}&network_id=${NETWORK_ID}`);
		
		if (!response.ok) {
			throw new Error(`Vestige assets API error: ${response.status}`);
		}

		const assets: VestigeAssetsResponse = await response.json();
		return assets;
	} catch (error) {
		console.error('Error fetching Vestige assets:', error);
		return [];
	}
}

/**
 * Get protocol name by ID
 */
export async function getProtocolName(protocolId: number): Promise<string> {
	const protocols = await fetchVestigeProtocols();
	const protocol = protocols.find(p => p.id === protocolId);
	
	if (!protocol) {
		return `Unknown Protocol ${protocolId}`;
	}

	// Handle Tinyman versions
	if (protocol.name === 'Tinyman') {
		return `Tinyman ${protocol.version}`;
	}

	return protocol.name;
}

/**
 * Get protocol URL by ID
 */
export async function getProtocolUrl(protocolId: number): Promise<string | null> {
	const protocols = await fetchVestigeProtocols();
	const protocol = protocols.find(p => p.id === protocolId);
	return protocol?.url || null;
}

/**
 * Convert Vestige pool to our market data format
 */
export async function convertVestigePoolToMarket(
	pool: VestigePool,
	targetAssetId: number,
	assets: VestigeAsset[],
	priceMap?: Map<string, number> // Optional USD prices for assets
): Promise<any> {
	// Get asset information
	const asset1 = assets.find(a => a.id === pool.asset_1_id);
	const asset2 = assets.find(a => a.id === pool.asset_2_id);
	
	if (!asset1 || !asset2) {
		console.warn(`Missing asset info for pool ${pool.id}:`, { asset1: !!asset1, asset2: !!asset2 });
		return null;
	}

	// Determine which asset is the base (target) and which is the quote
	const isAsset1Target = pool.asset_1_id === targetAssetId;
	const baseAsset = isAsset1Target ? asset1 : asset2;
	const quoteAsset = isAsset1Target ? asset2 : asset1;
	const baseSupply = isAsset1Target ? pool.asset_1_supply : pool.asset_2_supply;
	const quoteSupply = isAsset1Target ? pool.asset_2_supply : pool.asset_1_supply;

	// Calculate price (quote tokens per base token)
	// Convert supplies to actual token amounts by dividing by 10^decimals
	const baseAmount = baseSupply / Math.pow(10, baseAsset.decimals);
	const quoteAmount = quoteSupply / Math.pow(10, quoteAsset.decimals);
	
	// Price = quote amount / base amount (how many quote tokens per 1 base token)
	let price = baseAmount > 0 && quoteAmount > 0 ? quoteAmount / baseAmount : 0;
	
	// Filter out unrealistic prices (likely due to low liquidity or stale pools)
	// If price is extremely high or low, set to 0 to exclude from display
	const MAX_REASONABLE_PRICE = 100000; // 100k tokens per 1 base token (still very high)
	const MIN_REASONABLE_PRICE = 0.000001; // 1 millionth of a token per 1 base token
	
	if (price > MAX_REASONABLE_PRICE || (price > 0 && price < MIN_REASONABLE_PRICE)) {
		console.log(`Filtering out unrealistic price for ${baseAsset.ticker}/${quoteAsset.ticker}: ${price}`);
		price = 0;
	}
	
	console.log(`Price calculation for ${baseAsset.ticker}/${quoteAsset.ticker}:`, {
		baseSupply: baseSupply,
		quoteSupply: quoteSupply,
		baseDecimals: baseAsset.decimals,
		quoteDecimals: quoteAsset.decimals,
		baseAmount: baseAmount,
		quoteAmount: quoteAmount,
		calculatedPrice: price
	});

	// Get protocol information
	const exchangeName = await getProtocolName(pool.protocol_id);
	const protocolUrl = await getProtocolUrl(pool.protocol_id);

	// Calculate TVL (Total Value Locked)
	let tvl = 0;
	
	// Try to get USD prices from the provided price map first
	const baseUsdPrice = priceMap?.get(baseAsset.ticker) || 0;
	const quoteUsdPrice = priceMap?.get(quoteAsset.ticker) || 0;
	
	if (baseUsdPrice > 0 && quoteUsdPrice > 0) {
		// Both assets have USD prices - calculate exact TVL
		tvl = (baseAmount * baseUsdPrice) + (quoteAmount * quoteUsdPrice);
	} else if (baseUsdPrice > 0) {
		// Only base asset has USD price - assume balanced pool and double the base value
		tvl = baseAmount * baseUsdPrice * 2;
	} else if (quoteUsdPrice > 0) {
		// Only quote asset has USD price - assume balanced pool and double the quote value
		tvl = quoteAmount * quoteUsdPrice * 2;
	} else {
		// Fallback to stablecoin heuristic
		const stablecoins = ['USDC', 'USDT', 'aUSDC', 'aUSDT'];
		const baseIsStable = stablecoins.includes(baseAsset.ticker);
		const quoteIsStable = stablecoins.includes(quoteAsset.ticker);
		
		if (baseIsStable) {
			// Base asset is stable, so use base amount * 2 for TVL
			tvl = baseAmount * 2;
		} else if (quoteIsStable) {
			// Quote asset is stable, so use quote amount * 2 for TVL
			tvl = quoteAmount * 2;
		}
	}
	
	console.log(`TVL calculation for ${baseAsset.ticker}/${quoteAsset.ticker}:`, {
		baseUsdPrice: baseUsdPrice,
		quoteUsdPrice: quoteUsdPrice,
		baseAmount: baseAmount,
		quoteAmount: quoteAmount,
		calculatedTVL: tvl
	});

	// Volume is not provided by Vestige API, so we set to 0
	const volume24h = 0;

	// Generate pool URL based on protocol
	let poolUrl: string | null = null;
	if (pool.protocol_id === 0 || pool.protocol_id === 1) { // Tinyman
		poolUrl = `https://app.tinyman.org/#/swap?asset_in=${pool.asset_1_id}&asset_out=${pool.asset_2_id}`;
	}

	return {
		trading_pair_id: pool.id,
		exchange: exchangeName,
		pair: `${baseAsset.ticker}/${quoteAsset.ticker}`,
		type: 'DEX',
		network: 'Algorand',
		url: protocolUrl,
		pool_url: poolUrl,
		base_token_id: targetAssetId, // Always the selected token
		quote_token_id: isAsset1Target ? pool.asset_2_id : pool.asset_1_id,
		base_decimals: baseAsset.decimals,
		quote_decimals: quoteAsset.decimals,
		price: price,
		volume_24h: volume24h,
		tvl: tvl,
		high_24h: null,
		low_24h: null,
		price_change_24h: null,
		price_change_percentage_24h: null,
		lastUpdated: new Date().toISOString(),
		// Additional metadata
		vestige_pool_id: pool.id,
		application_id: pool.application_id,
		fee: pool.fee,
		asset_1_supply: pool.asset_1_supply,
		asset_2_supply: pool.asset_2_supply
	};
}

/**
 * Fetch and convert all pools for a given asset to market data format
 */
export async function fetchVestigeMarketsForAsset(assetId: number, priceMap?: Map<string, number>): Promise<any[]> {
	try {
		console.log(`Fetching Vestige markets for asset ID: ${assetId}`);
		
		// Fetch pools for this asset
		const pools = await fetchVestigePoolsByAsset(assetId);
		console.log(`Found ${pools.length} Vestige pools for asset ${assetId}`);
		
		if (pools.length === 0) {
			return [];
		}

		// Get all unique asset IDs from the pools
		const allAssetIds = new Set<number>();
		pools.forEach(pool => {
			allAssetIds.add(pool.asset_1_id);
			allAssetIds.add(pool.asset_2_id);
		});

		// Fetch asset details
		const assets = await fetchVestigeAssets(Array.from(allAssetIds));
		console.log(`Fetched ${assets.length} asset details from Vestige`);

		// Convert pools to market format
		const markets = await Promise.all(
			pools.map(pool => convertVestigePoolToMarket(pool, assetId, assets, priceMap))
		);

		// Filter out null results and markets with zero/unrealistic prices
		const validMarkets = markets.filter(market => market !== null && market.price > 0);
		console.log(`Successfully converted ${validMarkets.length} Vestige pools to market format (filtered out ${markets.length - validMarkets.length} pools with invalid prices)`);

		return validMarkets;
	} catch (error) {
		console.error('Error fetching Vestige markets for asset:', error);
		return [];
	}
}