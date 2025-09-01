import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';

// Create MIMIR client for OHLCV data
const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);
import type {
	PriceCandle,
	PoolCatalog,
	DexSwap,
	OHLCVData,
	VolumeData,
	TokenPair,
	Resolution,
	OHLCVRequest,
	OHLCVResponse
} from '$lib/types/ohlcv.types';

/**
 * Service for handling OHLCV (Open, High, Low, Close, Volume) data operations
 */
export class OHLCVService {
	/**
	 * Fetches available token pairs from the pool catalog
	 */
	static async getAvailableTokenPairs(): Promise<TokenPair[]> {
		const { data, error } = await supabaseMimirClient
			.from('pool_catalog')
			.select('*')
			.order('token_a_symbol', { ascending: true });

		if (error) {
			throw new Error(`Failed to fetch token pairs: ${error.message}`);
		}

		return (data as PoolCatalog[]).map((pool) => ({
			baseTokenId: pool.token_b_id,
			quoteTokenId: pool.token_a_id,
			baseSymbol: pool.token_b_symbol,
			quoteSymbol: pool.token_a_symbol,
			baseDecimals: pool.token_b_decimals,
			quoteDecimals: pool.token_a_decimals,
			poolId: pool.pool_id
		}));
	}

	/**
	 * Searches for token pairs by symbol
	 */
	static async searchTokenPairs(query: string): Promise<TokenPair[]> {
		const allPairs = await this.getAvailableTokenPairs();

		if (!query) return allPairs;

		const lowerQuery = query.toLowerCase();
		return allPairs.filter(
			(pair) =>
				pair.baseSymbol.toLowerCase().includes(lowerQuery) ||
				pair.quoteSymbol.toLowerCase().includes(lowerQuery) ||
				`${pair.baseSymbol}/${pair.quoteSymbol}`.toLowerCase().includes(lowerQuery)
		);
	}

	/**
	 * Fetches popular token pairs (e.g., pairs with highest volume)
	 */
	static async getPopularTokenPairs(limit: number = 10): Promise<TokenPair[]> {
		// For now, return the first N pairs sorted by symbol
		// In the future, this could be based on trading volume
		const allPairs = await this.getAvailableTokenPairs();
		return allPairs.slice(0, limit);
	}

	/**
	 * Refreshes price candles for a specific token pair and time range
	 */
	static async refreshPriceCandles(
		baseTokenId: number,
		quoteTokenId: number,
		resolution: Resolution,
		start: Date,
		end: Date
	): Promise<void> {
		const { error } = await supabaseMimirClient.rpc('refresh_price_candles', {
			p_base_token_id: baseTokenId,
			p_quote_token_id: quoteTokenId,
			p_resolution: resolution,
			p_start: start.toISOString(),
			p_end: end.toISOString()
		});

		if (error) {
			throw new Error(`Failed to refresh price candles: ${error.message}`);
		}
	}

	/**
	 * Fetches OHLCV data from the database
	 */
	static async fetchOHLCVData(request: OHLCVRequest): Promise<OHLCVResponse> {
		const {
			baseTokenId,
			quoteTokenId,
			resolution,
			start,
			end,
			limit = 500,
			refresh = false
		} = request;

		// Calculate time range
		const now = new Date();
		const endTime = end || now;
		const startTime =
			start || new Date(endTime.getTime() - limit * this.getResolutionInterval(resolution) * 1000);

		// Refresh candles if requested
		if (refresh) {
			await this.refreshPriceCandles(baseTokenId, quoteTokenId, resolution, startTime, endTime);
		}

		// Fetch candles from database
		const { data, error } = await supabaseMimirClient
			.from('price_candles')
			.select('*')
			.eq('base_token_id', baseTokenId)
			.eq('quote_token_id', quoteTokenId)
			.eq('resolution', resolution)
			.gte('bucket_start', startTime.toISOString())
			.lt('bucket_start', endTime.toISOString())
			.order('bucket_start', { ascending: true })
			.limit(limit);

		if (error) {
			throw new Error(`Failed to fetch OHLCV data: ${error.message}`);
		}

		const candles = (data as PriceCandle[]).map(this.convertToOHLCVData);
		const volumes = candles.map((candle) => ({
			time: candle.time,
			value: candle.volume,
			color: candle.close >= candle.open ? '#22c55e' : '#ef4444' // green for up, red for down
		}));

		return {
			baseTokenId,
			quoteTokenId,
			resolution,
			start: Math.floor(startTime.getTime() / 1000),
			end: Math.floor(endTime.getTime() / 1000),
			count: candles.length,
			candles,
			volumes
		};
	}

	/**
	 * Converts database PriceCandle to chart-compatible OHLCVData
	 */
	private static convertToOHLCVData(candle: PriceCandle): OHLCVData {
		return {
			time: Math.floor(new Date(candle.bucket_start).getTime() / 1000),
			open: Number(candle.open),
			high: Number(candle.high),
			low: Number(candle.low),
			close: Number(candle.close),
			volume: Number(candle.volume_base)
		};
	}

	/**
	 * Gets the interval in seconds for a resolution
	 */
	private static getResolutionInterval(resolution: Resolution): number {
		const intervals = {
			'1m': 60,
			'5m': 300,
			'15m': 900,
			'1h': 3600,
			'4h': 14400,
			'1d': 86400
		};
		return intervals[resolution];
	}

	/**
	 * Gets the default time range for a resolution
	 */
	static getDefaultTimeRange(resolution: Resolution): { start: Date; end: Date } {
		const now = new Date();
		const intervals = {
			'1m': 24 * 60 * 60 * 1000, // 1 day
			'5m': 7 * 24 * 60 * 60 * 1000, // 1 week
			'15m': 7 * 24 * 60 * 60 * 1000, // 1 week
			'1h': 30 * 24 * 60 * 60 * 1000, // 1 month
			'4h': 90 * 24 * 60 * 60 * 1000, // 3 months
			'1d': 365 * 24 * 60 * 60 * 1000 // 1 year
		};

		const start = new Date(now.getTime() - intervals[resolution]);
		return { start, end: now };
	}

	/**
	 * Validates if a token pair exists in the database
	 */
	static async validateTokenPair(baseTokenId: number, quoteTokenId: number): Promise<boolean> {
		const { data, error } = await supabaseMimirClient
			.from('pool_catalog')
			.select('pool_id')
			.or(
				`and(token_a_id.eq.${baseTokenId},token_b_id.eq.${quoteTokenId}),and(token_a_id.eq.${quoteTokenId},token_b_id.eq.${baseTokenId})`
			)
			.limit(1);

		if (error) {
			console.error('Error validating token pair:', error);
			return false;
		}

		return data && data.length > 0;
	}

	/**
	 * Gets token information by ID
	 */
	static async getTokenInfo(
		tokenId: number
	): Promise<{ symbol: string; decimals: number; type: string } | null> {
		// First check if it's VOI (token ID 0)
		if (tokenId === 0) {
			return { symbol: 'VOI', decimals: 6, type: 'VOI' };
		}

		// Check ARC200 contracts
		const { data: arc200Data, error: arc200Error } = await supabaseMimirClient
			.from('arc200_contracts')
			.select('symbol, decimals')
			.eq('contract_id', tokenId)
			.single();

		if (!arc200Error && arc200Data) {
			return { ...arc200Data, type: 'ARC200' };
		}

		// Check assets table for ASA
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
				type: 'ASA'
			};
		}

		return null;
	}
}
