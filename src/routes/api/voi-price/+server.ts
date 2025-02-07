import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

let cachedPrice = 0;
let lastFetched: Date | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const GET: RequestHandler = async () => {
    try {
        // Return cached price if it's still valid
        if (cachedPrice > 0 && lastFetched && (Date.now() - lastFetched.getTime()) < CACHE_DURATION) {
            return json({
                price: cachedPrice,
                lastUpdated: lastFetched
            });
        }

        // Fetch price from Mexc API
        const response = await fetch('https://www.mexc.com/open/api/v2/market/ticker?symbol=VOI_USDT');
        if (!response.ok) throw new Error('Failed to fetch VOI price from MEXC');
        
        const data = await response.json();
        if (!data.data || !data.data[0] || !data.data[0].last) {
            throw new Error('Invalid price data from MEXC');
        }

        // Update cache
        cachedPrice = Number(data.data[0].last);
        lastFetched = new Date();

        return json({
            price: cachedPrice,
            lastUpdated: lastFetched
        });
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