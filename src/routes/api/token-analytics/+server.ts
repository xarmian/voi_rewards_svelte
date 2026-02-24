import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';

// Create MIMIR client for dex swap data
const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);

interface TokenEquivalents {
	tokenId: number;
	equivalents: number[];
}

interface VolumeMetrics {
	volume24h: number;
	volume7d: number;
	volume30d: number;
}

interface TVLMetrics {
	totalTvl: number;
	poolCount: number;
}

interface TokenAnalytics {
	tokenId: number;
	symbol: string;
	decimals: number;
	imageUrl: string | null;
	volume: VolumeMetrics;
	tvl: TVLMetrics;
	priceMetrics: {
		currentPrice: number | null;
		priceChange24h: number | null;
		priceChangePercentage24h: number | null;
	};
}

// Get token equivalents from arc200_contracts table
async function getTokenEquivalents(tokenId: number): Promise<TokenEquivalents> {
	try {
		// Query arc200_contracts to find equivalent tokens
		const { data, error } = await supabaseMimirClient
			.from('arc200_contracts')
			.select('contract_id, token_id')
			.or(`contract_id.eq.${tokenId},token_id.eq.${tokenId}`);

		if (error) {
			console.error('Error fetching token equivalents:', error);
			return { tokenId, equivalents: [] };
		}

		if (!data || data.length === 0) {
			return { tokenId, equivalents: [] };
		}

		// Extract all equivalent IDs
		const equivalents: number[] = [];
		data.forEach((row) => {
			// Add the contract_id (ARC200 token)
			if (row.contract_id !== tokenId) {
				equivalents.push(row.contract_id);
			}

			// Add the token_id (ASA/native token) if it exists and contains no comma
			if (row.token_id && typeof row.token_id === 'string' && !row.token_id.includes(',')) {
				const equivalentId = parseInt(row.token_id, 10);
				if (!isNaN(equivalentId) && equivalentId !== tokenId) {
					equivalents.push(equivalentId);
				}
			}
		});

		return { tokenId, equivalents };
	} catch (error) {
		console.error('Failed to get token equivalents:', error);
		return { tokenId, equivalents: [] };
	}
}

// Calculate volume metrics for token and its equivalents
async function calculateVolumeMetrics(
	tokenId: number,
	equivalents: number[]
): Promise<VolumeMetrics> {
	const allIds = [tokenId, ...equivalents];

	try {
		// Calculate 24h volume
		const { data: volume24hData, error: volume24hError } = await supabaseMimirClient
			.from('dex_swaps_materialized')
			.select('volume_base, volume_quote, base_token_id, quote_token_id')
			.gte('ts', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
			.or(`base_token_id.in.(${allIds.join(',')}),quote_token_id.in.(${allIds.join(',')})`);

		if (volume24hError) throw volume24hError;

		// Calculate 7d volume
		const { data: volume7dData, error: volume7dError } = await supabaseMimirClient
			.from('dex_swaps_materialized')
			.select('volume_base, volume_quote, base_token_id, quote_token_id')
			.gte('ts', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
			.or(`base_token_id.in.(${allIds.join(',')}),quote_token_id.in.(${allIds.join(',')})`);

		if (volume7dError) throw volume7dError;

		// Calculate 30d volume
		const { data: volume30dData, error: volume30dError } = await supabaseMimirClient
			.from('dex_swaps_materialized')
			.select('volume_base, volume_quote, base_token_id, quote_token_id')
			.gte('ts', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
			.or(`base_token_id.in.(${allIds.join(',')}),quote_token_id.in.(${allIds.join(',')})`);

		if (volume30dError) throw volume30dError;

		// Aggregate volume for each period
		const volume24h = aggregateVolume(volume24hData || [], allIds);
		const volume7d = aggregateVolume(volume7dData || [], allIds);
		const volume30d = aggregateVolume(volume30dData || [], allIds);

		return {
			volume24h,
			volume7d,
			volume30d
		};
	} catch (error) {
		console.error('Failed to calculate volume metrics:', error);
		return {
			volume24h: 0,
			volume7d: 0,
			volume30d: 0
		};
	}
}

// Helper function to aggregate volume from swap data
function aggregateVolume(
	swaps: Array<{
		volume_base: number;
		volume_quote: number;
		base_token_id: number;
		quote_token_id: number;
	}>,
	targetTokenIds: number[]
): number {
	return swaps.reduce((total, swap) => {
		let volume = 0;

		// Add volume when token is the base token
		if (targetTokenIds.includes(swap.base_token_id)) {
			volume += swap.volume_base || 0;
		}

		// Add volume when token is the quote token
		if (targetTokenIds.includes(swap.quote_token_id)) {
			volume += swap.volume_quote || 0;
		}

		return total + volume;
	}, 0);
}

// Calculate TVL metrics using latest pool balances
async function calculateTVLMetrics(tokenId: number, equivalents: number[]): Promise<TVLMetrics> {
	const allIds = [tokenId, ...equivalents];

	try {
		// Get latest pool balances for each pool containing our tokens
		const { data, error } = await supabaseMimirClient
			.from('dex_swaps_materialized')
			.select('pool_id, poolbal_a, poolbal_b, base_token_id, quote_token_id, ts')
			.or(`base_token_id.in.(${allIds.join(',')}),quote_token_id.in.(${allIds.join(',')})`);

		if (error) throw error;

		if (!data || data.length === 0) {
			return { totalTvl: 0, poolCount: 0 };
		}

		// Group by pool_id and get the latest entry for each pool
		const latestPoolData = new Map();

		data.forEach((row) => {
			const poolId = row.pool_id;
			const ts = new Date(row.ts).getTime();

			if (!latestPoolData.has(poolId) || latestPoolData.get(poolId).ts < ts) {
				latestPoolData.set(poolId, {
					...row,
					ts
				});
			}
		});

		// Calculate TVL for our token across all pools
		let totalTvl = 0;
		let poolCount = 0;

		latestPoolData.forEach((poolData) => {
			// Add balance for our token from this pool
			if (allIds.includes(poolData.base_token_id)) {
				totalTvl += poolData.poolbal_a || 0;
			}
			if (allIds.includes(poolData.quote_token_id)) {
				totalTvl += poolData.poolbal_b || 0;
			}
			poolCount++;
		});

		return {
			totalTvl,
			poolCount
		};
	} catch (error) {
		console.error('Failed to calculate TVL metrics:', error);
		return { totalTvl: 0, poolCount: 0 };
	}
}

// Get token basic info
async function getTokenInfo(tokenId: number): Promise<{
	symbol: string;
	decimals: number;
	imageUrl: string | null;
}> {
	try {
		// Handle VOI (token ID 0)
		if (tokenId === 0) {
			return {
				symbol: 'VOI',
				decimals: 6,
				imageUrl: null
			};
		}

		// Check ARC200 contracts first
		const { data: arc200Data, error: arc200Error } = await supabaseMimirClient
			.from('arc200_contracts')
			.select('symbol, decimals, image_url')
			.eq('contract_id', tokenId)
			.single();

		if (!arc200Error && arc200Data) {
			return {
				symbol: arc200Data.symbol || 'UNKNOWN',
				decimals: arc200Data.decimals || 0,
				imageUrl: arc200Data.image_url || null
			};
		}

		// Fallback to assets table for ASA
		const { data: assetData, error: assetError } = await supabaseMimirClient
			.from('asset')
			.select('params')
			.eq('index', tokenId)
			.single();

		if (!assetError && assetData && assetData.params) {
			const params = assetData.params as any;
			return {
				symbol: params.un || 'UNKNOWN',
				decimals: params.dc || 0,
				imageUrl: null
			};
		}

		// Unknown token
		return {
			symbol: 'UNKNOWN',
			decimals: 0,
			imageUrl: null
		};
	} catch (error) {
		console.error('Failed to get token info:', error);
		return {
			symbol: 'UNKNOWN',
			decimals: 0,
			imageUrl: null
		};
	}
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const tokenIdParam = url.searchParams.get('tokenId');

		if (!tokenIdParam || !/^\d+$/.test(tokenIdParam)) {
			return json({ error: 'Valid tokenId parameter is required' }, { status: 400 });
		}

		const tokenId = parseInt(tokenIdParam, 10);

		// Get token equivalents, volume metrics, TVL metrics, and basic info in parallel
		const [equivalents, tokenInfo] = await Promise.all([
			getTokenEquivalents(tokenId),
			getTokenInfo(tokenId)
		]);

		const [volumeMetrics, tvlMetrics] = await Promise.all([
			calculateVolumeMetrics(tokenId, equivalents.equivalents),
			calculateTVLMetrics(tokenId, equivalents.equivalents)
		]);

		const analytics: TokenAnalytics = {
			tokenId,
			symbol: tokenInfo.symbol,
			decimals: tokenInfo.decimals,
			imageUrl: tokenInfo.imageUrl,
			volume: volumeMetrics,
			tvl: tvlMetrics,
			priceMetrics: {
				currentPrice: null, // To be filled by existing price data
				priceChange24h: null,
				priceChangePercentage24h: null
			}
		};

		return json({
			success: true,
			analytics,
			equivalents: equivalents.equivalents,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Token analytics API error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	});
};
