import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';
import type {
	Resolution,
	OHLCVRequest,
	OHLCVData,
	VolumeData,
	PriceCandle
} from '$lib/types/ohlcv.types';

// Create MIMIR client for OHLCV data
const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);

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
		const refresh = url.searchParams.get('refresh') === 'true';

		// Validate required parameters
		if (isNaN(baseTokenId)) {
			return json({ error: 'baseTokenId is required and must be a valid number' }, { status: 400 });
		}

		// Handle USD quote equivalent
		let finalQuoteTokenId = quoteTokenId;
		if (isNaN(quoteTokenId) && quote?.toUpperCase() === 'USD') {
			// You may want to configure a specific USD equivalent token ID
			// For now, we'll use a default value (this should be configured in your environment)
			finalQuoteTokenId = 390001; // Example USDC token ID - adjust as needed
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

		// Refresh candles if requested
		if (refresh) {
			const { data: refreshData, error: refreshError } = await supabaseMimirClient.rpc(
				'refresh_price_candles',
				{
					p_base_token_id: baseTokenId,
					p_quote_token_id: finalQuoteTokenId,
					p_resolution: resolution,
					p_start: startTime.toISOString(),
					p_end: endTime.toISOString()
				}
			);

			console.log('Refresh data:', refreshData);

			if (refreshError) {
				console.warn('Failed to refresh price candles:', refreshError);
			}
		}

		// Fetch candles from MIMIR database
		const { data, error } = await supabaseMimirClient
			.from('price_candles')
			.select('*')
			.eq('base_token_id', baseTokenId)
			.eq('quote_token_id', finalQuoteTokenId)
			.eq('resolution', resolution)
			.gte('bucket_start', startTime.toISOString())
			.lt('bucket_start', endTime.toISOString())
			.order('bucket_start', { ascending: true })
			.limit(Math.min(limit, 2000));

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

		return json(response);
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
