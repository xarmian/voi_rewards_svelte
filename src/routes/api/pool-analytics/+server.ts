import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';

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
		volume24h: number;
		volume7d: number;
		volume30d: number;
		volumeTokenA24h: number;
		volumeTokenB24h: number;
	};
	liquidity: {
		totalTvlUsd: number | null;
		reserveA: number;
		reserveB: number;
		lpTokenSupply: number;
	};
	metrics: {
		priceRatio: number;
		averageFee: number | null;
		swapCount24h: number;
		uniqueTraders24h: number;
	};
}

// Get pool data using the get_arc200_pools function
async function getPoolData(poolId: number): Promise<any> {
	try {
		const { data, error } = await supabaseMimirClient.rpc('get_arc200_pools', { params: {
			poolId: poolId
		}});

		if (error) {
			console.error('Error calling get_arc200_pools:', error);
			return null;
		}

		if (!data || !data.pools || data.pools.length === 0) {
			return null;
		}

		return data.pools[0];
	} catch (error) {
		console.error('Failed to get pool data:', error);
		return null;
	}
}

// Calculate volume metrics for specific pool
async function calculatePoolVolumeMetrics(poolId: number): Promise<{
	volume24h: number;
	volume7d: number;
	volume30d: number;
	volumeTokenA24h: number;
	volumeTokenB24h: number;
	swapCount24h: number;
	uniqueTraders24h: number;
}> {
	try {
		// Calculate 24h metrics with detailed breakdown
		const { data: volume24hData, error: volume24hError } = await supabaseMimirClient
			.from('dex_swaps_materialized')
			.select('volume_base, volume_quote, base_token_id, quote_token_id, trader_hex')
			.eq('pool_id', poolId)
			.gte('ts', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

		if (volume24hError) throw volume24hError;

		// Calculate 7d volume
		const { data: volume7dData, error: volume7dError } = await supabaseMimirClient
			.from('dex_swaps_materialized')
			.select('volume_base, volume_quote')
			.eq('pool_id', poolId)
			.gte('ts', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

		if (volume7dError) throw volume7dError;

		// Calculate 30d volume
		const { data: volume30dData, error: volume30dError } = await supabaseMimirClient
			.from('dex_swaps_materialized')
			.select('volume_base, volume_quote')
			.eq('pool_id', poolId)
			.gte('ts', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

		if (volume30dError) throw volume30dError;

		// Process 24h data for detailed metrics
		const volume24h = (volume24hData || []).reduce((total, swap) => {
			return total + (swap.volume_base || 0) + (swap.volume_quote || 0);
		}, 0);

		const volumeTokenA24h = (volume24hData || []).reduce((total, swap) => {
			return total + (swap.volume_base || 0);
		}, 0);

		const volumeTokenB24h = (volume24hData || []).reduce((total, swap) => {
			return total + (swap.volume_quote || 0);
		}, 0);

		const swapCount24h = volume24hData?.length || 0;
		const uniqueTraders24h = new Set((volume24hData || []).map((swap) => swap.trader_hex)).size;

		// Calculate 7d and 30d volumes
		const volume7d = (volume7dData || []).reduce((total, swap) => {
			return total + (swap.volume_base || 0) + (swap.volume_quote || 0);
		}, 0);

		const volume30d = (volume30dData || []).reduce((total, swap) => {
			return total + (swap.volume_base || 0) + (swap.volume_quote || 0);
		}, 0);

		return {
			volume24h,
			volume7d,
			volume30d,
			volumeTokenA24h,
			volumeTokenB24h,
			swapCount24h,
			uniqueTraders24h
		};
	} catch (error) {
		console.error('Failed to calculate pool volume metrics:', error);
		return {
			volume24h: 0,
			volume7d: 0,
			volume30d: 0,
			volumeTokenA24h: 0,
			volumeTokenB24h: 0,
			swapCount24h: 0,
			uniqueTraders24h: 0
		};
	}
}

// Get latest pool reserves from most recent swap data
async function getLatestPoolReserves(poolId: number): Promise<{
	reserveA: number;
	reserveB: number;
} | null> {
	try {
		const { data, error } = await supabaseMimirClient
			.from('dex_swaps_materialized')
			.select('poolbal_a, poolbal_b')
			.eq('pool_id', poolId)
			.order('ts', { ascending: false })
			.limit(1)
			.single();

		if (error || !data) {
			return null;
		}

		return {
			reserveA: data.poolbal_a || 0,
			reserveB: data.poolbal_b || 0
		};
	} catch (error) {
		console.error('Failed to get pool reserves:', error);
		return null;
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
		const [poolData, volumeMetrics] = await Promise.all([
			getPoolData(poolId),
			calculatePoolVolumeMetrics(poolId)
		]);

		if (!poolData) {
			return json({ error: 'Pool not found' }, { status: 404 });
		}

		// Get latest reserves and average fee
		const [reserves, averageFee] = await Promise.all([
			getLatestPoolReserves(poolId),
			calculateAverageFee(poolId)
		]);

		// Calculate price ratio (tokenB/tokenA)
		const priceRatio =
			reserves && reserves.reserveA > 0 ? reserves.reserveB / reserves.reserveA : 0;

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
				reserveA: reserves?.reserveA || parseFloat(poolData.tokenA.balance),
				reserveB: reserves?.reserveB || parseFloat(poolData.tokenB.balance),
				lpTokenSupply: parseFloat(poolData.outstandingLpAmount)
			},
			metrics: {
				priceRatio,
				averageFee,
				swapCount24h: volumeMetrics.swapCount24h,
				uniqueTraders24h: volumeMetrics.uniqueTraders24h
			}
		};

		return json({
			success: true,
			analytics,
			timestamp: new Date().toISOString(),
			currentRound: poolData['current-round'] || null
		});
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
