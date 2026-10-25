import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';
import {
	fetchPoolAggregates,
	tokenVolumeMetrics,
	tokenTvlMetrics,
	type PoolAggregate
} from '$lib/server/poolAggregates';

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

		// TASK-52, C11, P06: discover pools once and share their aggregates across both metrics.
		const allIds = [tokenId, ...equivalents.equivalents];
		let aggregates = new Map<number, PoolAggregate>();
		try {
			const { data: pools, error } = await supabaseMimirClient
				.from('pool_catalog')
				.select('pool_id, token_a_id, token_b_id')
				.or(`token_a_id.in.(${allIds.join(',')}),token_b_id.in.(${allIds.join(',')})`);
			if (error) throw error;
			aggregates = await fetchPoolAggregates(
				supabaseMimirClient,
				(pools || []).map((pool) => pool.pool_id)
			);
		} catch (error) {
			console.error('Failed to calculate volume metrics:', error);
			console.error('Failed to calculate TVL metrics:', error);
		}
		const volumeMetrics = tokenVolumeMetrics(aggregates.values(), allIds);
		const tvlMetrics = tokenTvlMetrics(aggregates.values(), allIds);

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
