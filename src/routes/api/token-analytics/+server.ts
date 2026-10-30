import { UPSTREAM_TIMEOUT_MS } from '$lib/server/fetchWithTimeout';
import { CACHE_TTL, publicCache } from '$lib/server/httpCache';
import { isRetiredExchange } from '$lib/markets/retired';
import { json, type RequestHandler } from '@sveltejs/kit';
import { mimirClient as supabaseMimirClient } from '$lib/mimir';
import { getTokenEquivalents } from '$lib/tokens/equivalents';
import {
	fetchPoolAggregates,
	tokenMetricsOrUnavailable,
	type PoolAggregate
} from '$lib/server/poolAggregates';

interface VolumeMetrics {
	volume24h: number | null;
	volume7d: number | null;
	volume30d: number | null;
}

interface TVLMetrics {
	totalTvl: number | null;
	poolCount: number | null;
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

// Get token basic info
async function getTokenInfo(tokenId: number): Promise<{
	symbol: string;
	decimals: number;
	imageUrl: string | null;
	failed: boolean;
}> {
	try {
		// Handle VOI (token ID 0)
		if (tokenId === 0) {
			return {
				symbol: 'VOI',
				decimals: 6,
				imageUrl: null,
				failed: false
			};
		}

		// Check ARC200 contracts first
		const { data: arc200Data, error: arc200Error } = await supabaseMimirClient
			.from('arc200_contracts')
			.select('symbol, decimals, image_url')
			.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
			.eq('contract_id', tokenId)
			.maybeSingle();

		if (!arc200Error && arc200Data) {
			return {
				symbol: arc200Data.symbol || 'UNKNOWN',
				decimals: arc200Data.decimals || 0,
				imageUrl: arc200Data.image_url || null,
				failed: false
			};
		}

		// Fallback to assets table for ASA
		const { data: assetData, error: assetError } = await supabaseMimirClient
			.from('asset')
			.select('params')
			.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
			.eq('index', tokenId)
			.maybeSingle();

		if (!assetError && assetData && assetData.params) {
			const params = assetData.params as any;
			return {
				symbol: params.un || 'UNKNOWN',
				decimals: params.dc || 0,
				imageUrl: null,
				failed: !!arc200Error
			};
		}

		// Unknown token
		return {
			symbol: 'UNKNOWN',
			decimals: 0,
			imageUrl: null,
			failed: !!arc200Error || !!assetError
		};
	} catch (error) {
		console.error('Failed to get token info:', error);
		return {
			symbol: 'UNKNOWN',
			decimals: 0,
			imageUrl: null,
			failed: true
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
		const allIds = [tokenId, ...equivalents.ids];
		const partialReasons: string[] = [];
		if (equivalents.failed) partialReasons.push('equivalents');
		if (tokenInfo.failed) partialReasons.push('tokenInfo');
		let aggregates: Map<number, PoolAggregate> | null = null;
		try {
			const { data: pools, error } = await supabaseMimirClient
				.from('pool_catalog')
				.select('pool_id, token_a_id, token_b_id, exchange')
				.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
				.or(`token_a_id.in.(${allIds.join(',')}),token_b_id.in.(${allIds.join(',')})`);
			if (error) throw error;
			aggregates = await fetchPoolAggregates(
				supabaseMimirClient,
				// TASK-88: a retired exchange's pools don't count toward the token's totals.
				(pools || [])
					.filter((pool) => !isRetiredExchange(pool.exchange))
					.map((pool) => pool.pool_id)
			);
		} catch (error) {
			partialReasons.push('aggregates');
			console.error('Failed to fetch pool aggregates for volume and TVL metrics:', error);
		}
		const { volume, tvl } = tokenMetricsOrUnavailable(aggregates, allIds);

		const analytics: TokenAnalytics = {
			tokenId,
			symbol: tokenInfo.symbol,
			decimals: tokenInfo.decimals,
			imageUrl: tokenInfo.imageUrl,
			volume,
			tvl,
			priceMetrics: {
				currentPrice: null, // To be filled by existing price data
				priceChange24h: null,
				priceChangePercentage24h: null
			}
		};

		return json(
			{
				success: true,
				partial: partialReasons.length > 0,
				partialReasons,
				analytics,
				equivalents: equivalents.ids,
				timestamp: new Date().toISOString()
			},
			{
				headers:
					partialReasons.length === 0
						? publicCache(
								CACHE_TTL['token-analytics'].sMaxAge,
								CACHE_TTL['token-analytics'].staleWhileRevalidate
							)
						: undefined
			}
		);
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
