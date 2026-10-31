import { CACHE_TTL, publicCache } from '$lib/server/httpCache';
import { json, type RequestHandler } from '@sveltejs/kit';
import { mimirClient as supabaseMimirClient } from '$lib/mimir';
import { UPSTREAM_TIMEOUT_MS } from '$lib/server/fetchWithTimeout';
import type {
	Resolution,
	OHLCVRequest,
	OHLCVData,
	VolumeData,
	PriceCandle
} from '$lib/types/ohlcv.types';

// VOI native token can be represented by either token ID 0 or 390001 (wVOI)
const VOI_TOKEN_IDS = [0, 390001];
// aUSDC can be represented by either token ID 302190 or 395614
const AUSDC_TOKEN_IDS = [302190, 395614];

const getEquivalentTokenIds = (tokenId: number): number[] => {
	if (VOI_TOKEN_IDS.includes(tokenId)) return VOI_TOKEN_IDS;
	if (AUSDC_TOKEN_IDS.includes(tokenId)) return AUSDC_TOKEN_IDS;
	return [tokenId];
};

const hasEquivalents = (tokenId: number): boolean => {
	return VOI_TOKEN_IDS.includes(tokenId) || AUSDC_TOKEN_IDS.includes(tokenId);
};

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Parse query parameters
		const baseTokenId = parseInt(url.searchParams.get('baseTokenId') || '');
		const quoteTokenId = parseInt(url.searchParams.get('quoteTokenId') || '');
		const quote = url.searchParams.get('quote');
		const resolution = (url.searchParams.get('resolution') || '1h') as Resolution;
		const startParam = url.searchParams.get('start');
		const endParam = url.searchParams.get('end');
		const limitParam = url.searchParams.get('limit');

		// Validate required parameters
		if (isNaN(baseTokenId)) {
			return json({ error: 'baseTokenId is required and must be a valid number' }, { status: 400 });
		}

		// quote=USD means aUSDC, the pair createVOITokenPair uses (TASK-49)
		let finalQuoteTokenId = quoteTokenId;
		if (isNaN(quoteTokenId) && quote?.toUpperCase() === 'USD') {
			finalQuoteTokenId = AUSDC_TOKEN_IDS[0];
		}

		if (isNaN(finalQuoteTokenId)) {
			return json(
				{
					error:
						'quoteTokenId is required and must be a valid number, or quote=USD must be provided'
				},
				{ status: 400 }
			);
		}

		// Parse dates with defaults
		const now = new Date();
		let start: Date | undefined;
		let end: Date | undefined;

		if (startParam) {
			if (/^\d+$/.test(startParam)) {
				start = new Date(parseInt(startParam) * 1000);
			} else {
				start = new Date(startParam);
			}

			if (isNaN(start.getTime())) {
				return json({ error: 'Invalid start date format' }, { status: 400 });
			}
		}

		if (endParam) {
			if (/^\d+$/.test(endParam)) {
				end = new Date(parseInt(endParam) * 1000);
			} else {
				end = new Date(endParam);
			}

			if (isNaN(end.getTime())) {
				return json({ error: 'Invalid end date format' }, { status: 400 });
			}
		}

		// Set default time range if not provided
		const endTime = end || now;
		const limit = limitParam ? parseInt(limitParam) : 500;

		// Default time ranges by resolution
		const intervalMs = {
			'1m': 24 * 60 * 60 * 1000, // 1 day
			'5m': 7 * 24 * 60 * 60 * 1000, // 1 week
			'15m': 7 * 24 * 60 * 60 * 1000, // 1 week
			'1h': 30 * 24 * 60 * 60 * 1000, // 1 month
			'4h': 90 * 24 * 60 * 60 * 1000, // 3 months
			'1d': 365 * 24 * 60 * 60 * 1000 // 1 year
		};

		const startTime =
			start || new Date(endTime.getTime() - intervalMs[resolution as keyof typeof intervalMs]);

		// Validate resolution
		const validResolutions = ['1m', '5m', '15m', '1h', '4h', '1d'];
		if (!validResolutions.includes(resolution)) {
			return json(
				{
					error: `Invalid resolution. Must be one of: ${validResolutions.join(', ')}`
				},
				{ status: 400 }
			);
		}

		// Fetch candles from MIMIR database
		let query = supabaseMimirClient.from('price_candles').select('*');

		// Handle base token - use .in() for equivalent tokens (VOI, aUSDC)
		if (hasEquivalents(baseTokenId)) {
			query = query.in('base_token_id', getEquivalentTokenIds(baseTokenId));
		} else {
			query = query.eq('base_token_id', baseTokenId);
		}

		// Handle quote token - use .in() for equivalent tokens (VOI, aUSDC)
		if (hasEquivalents(finalQuoteTokenId)) {
			query = query.in('quote_token_id', getEquivalentTokenIds(finalQuoteTokenId));
		} else {
			query = query.eq('quote_token_id', finalQuoteTokenId);
		}

		const { data, error } = await query
			.eq('resolution', resolution)
			.gte('bucket_start', startTime.toISOString())
			.lt('bucket_start', endTime.toISOString())
			.order('bucket_start', { ascending: true })
			.limit(Math.min(limit, 2000))
			.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS));

		if (error) {
			return json({ error: `Failed to fetch OHLCV data: ${error.message}` }, { status: 500 });
		}

		// Convert to chart format. Use quote volume so bars reflect the quote token.
		const candles: OHLCVData[] = (data as PriceCandle[]).map((candle) => ({
			time: Math.floor(new Date(candle.bucket_start).getTime() / 1000),
			open: Number(candle.open),
			high: Number(candle.high),
			low: Number(candle.low),
			close: Number(candle.close),
			volume: Number(candle.volume_quote)
		}));

		const volumes: VolumeData[] = candles.map((candle) => ({
			time: candle.time,
			value: candle.volume,
			color: candle.close >= candle.open ? '#22c55e' : '#ef4444'
		}));

		const response = {
			baseTokenId,
			quoteTokenId: finalQuoteTokenId,
			resolution,
			start: Math.floor(startTime.getTime() / 1000),
			end: Math.floor(endTime.getTime() / 1000),
			count: candles.length,
			candles,
			volumes
		};

		return json(response, {
			headers: publicCache(CACHE_TTL.ohlcv.sMaxAge, CACHE_TTL.ohlcv.staleWhileRevalidate)
		});
	} catch (error) {
		console.error('OHLCV API Error:', error);

		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		return json({ error: errorMessage }, { status: 500 });
	}
};

// Optional: Add CORS headers for development
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
