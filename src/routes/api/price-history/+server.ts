import { UPSTREAM_TIMEOUT_MS } from '$lib/server/fetchWithTimeout';
import { CACHE_TTL, publicCache } from '$lib/server/httpCache';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabasePrivateClient } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url }) => {
	const period = url.searchParams.get('period') || '24h';
	const tradingPairId = url.searchParams.get('trading_pair_id');

	try {
		const { data, error } = await supabasePrivateClient
			.rpc('get_price_history', {
				p_period: period,
				p_trading_pair_id: tradingPairId === 'null' ? null : tradingPairId
			})
			.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS));

		if (error) throw error;

		// Map bucket_time to time in data. A bucket whose snapshots all have null volume
		// (Uniswap) has no volume-weighted price, so it is dropped rather than charted as null.
		const mappedData = data
			.filter(({ value }: { value: number | null }) => value !== null)
			.map(({ bucket_time, value }: { bucket_time: string; value: number }) => ({
				time: bucket_time,
				value
			}));

		return json(mappedData, {
			headers: publicCache(
				CACHE_TTL['price-history'].sMaxAge,
				CACHE_TTL['price-history'].staleWhileRevalidate
			)
		});
	} catch (error) {
		console.error('Error fetching price history:', error);
		return json({ error: 'Failed to fetch price history' }, { status: 500 });
	}
};
