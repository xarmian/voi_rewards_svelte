import { CACHE_TTL, publicCache } from '$lib/server/httpCache';
import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';
import {
	fetchPoolAggregates,
	poolMetricsOrUnavailable,
	poolLatestReserves
} from '$lib/server/poolAggregates';

// Create MIMIR client for pool data
const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);

interface PoolToken {
	id: number;
	type: 'VOI' | 'ARC200' | 'ASA' | 'UNKNOWN';
	symbol: string;
	balance: string;
	decimals: number;
	volume24h: string;
}

interface PoolAnalytics {
	poolId: number;
	tokenA: PoolToken;
	tokenB: PoolToken;
	escrowAddress: string;
	outstandingLpAmount: string;
	volume: {
		volume24h: number | null;
		volume7d: number | null;
		volume30d: number | null;
		volumeTokenA24h: number | null;
		volumeTokenB24h: number | null;
	};
	liquidity: {
		totalTvlUsd: number | null;
		reserveA: number;
		reserveB: number;
		lpTokenSupply: number;
	};
	metrics: {
		priceRatio: number | null;
		averageFee: number | null;
		swapCount24h: number | null;
		uniqueTraders24h: number | null;
	};
}

// Get pool data using the get_arc200_pools function
async function getPoolData(poolId: number): Promise<any> {
	try {
		const { data, error } = await supabaseMimirClient.rpc('get_arc200_pools', {
			params: {
				poolId: poolId
			}
		});

		if (error) {
			console.error('Error calling get_arc200_pools:', error);
			return { pool: null, failed: true };
		}

		if (!data || !data.pools || data.pools.length === 0) {
			return { pool: null, failed: false };
		}

		return { pool: data.pools[0], failed: false };
	} catch (error) {
		console.error('Failed to get pool data:', error);
		return { pool: null, failed: true };
	}
}

// Calculate average swap fee for the pool
async function calculateAverageFee(poolId: number): Promise<number | null> {
	// This would require additional pool configuration data
	// For now, return null as fee data isn't in the provided schema
	// Could be enhanced with pool configuration data
	return null;
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const poolIdParam = url.searchParams.get('poolId');

		if (!poolIdParam || !/^\d+$/.test(poolIdParam)) {
			return json({ error: 'Valid poolId parameter is required' }, { status: 400 });
		}

		const poolId = parseInt(poolIdParam, 10);

		// Get pool data and volume metrics in parallel
		const [poolResult, aggregates] = await Promise.all([
			getPoolData(poolId),
			fetchPoolAggregates(supabaseMimirClient, [poolId]).catch((error) => {
				console.error('Failed to fetch pool aggregates:', error);
				return null;
			})
		]);

		if (poolResult.failed) {
			return json({ error: 'Pool data unavailable' }, { status: 502 });
		}
		const poolData = poolResult.pool;
		if (!poolData) {
			return json({ error: 'Pool not found' }, { status: 404 });
		}

		// TASK-52, C11, P06: one aggregate supplies both volume and latest reserves.
		const partialReasons = aggregates === null ? ['aggregates'] : [];
		const agg = aggregates?.get(poolId);
		const volumeMetrics = poolMetricsOrUnavailable(agg, aggregates === null);
		const reserves = poolLatestReserves(agg);
		const reserveA = reserves?.reserveA || parseFloat(poolData.tokenA.balance);
		const reserveB = reserves?.reserveB || parseFloat(poolData.tokenB.balance);
		const averageFee = await calculateAverageFee(poolId);

		// Calculate price ratio (tokenB/tokenA)
		const priceRatio = reserveA > 0 ? reserveB / reserveA : null;

		// Construct analytics response
		const analytics: PoolAnalytics = {
			poolId,
			tokenA: poolData.tokenA,
			tokenB: poolData.tokenB,
			escrowAddress: poolData.escrowAddress,
			outstandingLpAmount: poolData.outstandingLpAmount,
			volume: {
				volume24h: volumeMetrics.volume24h,
				volume7d: volumeMetrics.volume7d,
				volume30d: volumeMetrics.volume30d,
				volumeTokenA24h: volumeMetrics.volumeTokenA24h,
				volumeTokenB24h: volumeMetrics.volumeTokenB24h
			},
			liquidity: {
				totalTvlUsd: null, // Could be calculated with price data
				reserveA,
				reserveB,
				lpTokenSupply: parseFloat(poolData.outstandingLpAmount)
			},
			metrics: {
				priceRatio,
				averageFee,
				swapCount24h: volumeMetrics.swapCount24h,
				uniqueTraders24h: volumeMetrics.uniqueTraders24h
			}
		};

		return json(
			{
				success: true,
				partial: partialReasons.length > 0,
				partialReasons,
				analytics,
				timestamp: new Date().toISOString(),
				currentRound: poolData['current-round'] || null
			},
			{
				headers:
					partialReasons.length === 0
						? publicCache(
								CACHE_TTL['pool-analytics'].sMaxAge,
								CACHE_TTL['pool-analytics'].staleWhileRevalidate
							)
						: undefined
			}
		);
	} catch (error) {
		console.error('Pool analytics API error:', error);
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
