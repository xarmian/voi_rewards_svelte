import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
    // Get token from URL or default to VOI
    const token = url.searchParams.get('token') || 'VOI';

    const [marketDataRes, priceHistoryRes] = await Promise.all([
        fetch(`/api/markets?token=${token}`),
        fetch(`/api/price-history?period=24h&token=${token}`)
    ]);

    const marketData = await marketDataRes.json();
    const priceHistory = await priceHistoryRes.json();

    return {
        ...marketData,
        priceHistory
    };
}; 