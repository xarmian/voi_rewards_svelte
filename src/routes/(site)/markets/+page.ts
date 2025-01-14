import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
    const [marketDataRes, priceHistoryRes] = await Promise.all([
        fetch('/api/markets'),
        fetch('/api/price-history?period=24h')
    ]);

    const marketData = await marketDataRes.json();
    const priceHistory = await priceHistoryRes.json();

    return {
        ...marketData,
        priceHistory
    };
}; 