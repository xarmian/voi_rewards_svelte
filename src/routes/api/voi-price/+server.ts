import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabasePrivateClient } from '$lib/supabase-server';

let cachedPrice = 0;
let lastFetched: Date | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const GET: RequestHandler = async () => {
	try {
		// Return cached price if it's still valid
		if (cachedPrice > 0 && lastFetched && Date.now() - lastFetched.getTime() < CACHE_DURATION) {
			return json({
				price: cachedPrice,
				lastUpdated: lastFetched
			});
		}

		// Get VOI price from price history (which uses proper market data)
		const { data, error } = await supabasePrivateClient.rpc('get_price_history', {
			p_period: '24h',
			p_trading_pair_id: null
		});

		if (error) throw error;

		if (data && data.length > 0) {
			// Get the most recent price
			const latestPrice = data[data.length - 1];
			cachedPrice = Number(latestPrice.value || 0);
			lastFetched = new Date();

			console.log('VOI price from price history:', cachedPrice);

			return json({
				price: cachedPrice,
				lastUpdated: lastFetched
			});
		}

		throw new Error('No price data available');
	} catch (error) {
		console.error('Error fetching VOI price:', error);

		// If we have a cached price, return it even if expired
		if (cachedPrice > 0 && lastFetched) {
			return json({
				price: cachedPrice,
				lastUpdated: lastFetched,
				isStale: true
			});
		}

		// If all else fails, return 0
		return json({
			price: 0,
			lastUpdated: new Date(),
			error: 'Failed to fetch price'
		});
	}
};
