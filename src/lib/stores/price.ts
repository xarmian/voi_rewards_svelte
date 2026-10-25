import { writable, get } from 'svelte/store';

interface PriceData {
	price: number;
	lastUpdated: Date | null;
	error: string | null;
}

export const voiPrice = writable<PriceData>({ price: 0, lastUpdated: null, error: null });

export function updateVoiPrice(price: number, lastUpdated: Date) {
	voiPrice.set({ price, lastUpdated, error: null });
}

export async function fetchVoiPrice(refresh: boolean = false) {
	return fetchVoiPriceWith(fetch, refresh);
}

export async function fetchVoiPriceWith(
	fetchFn: (url: string) => Promise<Response>,
	refresh = false
) {
	// If price is already set, don't fetch again
	const currentPrice = get(voiPrice);
	if (currentPrice.price > 0 && !refresh) return;


	try {
		/*const response = await fetch('/api/markets?token=VOI');
        if (!response.ok) throw new Error('Failed to fetch VOI price');
        const data = await response.json();
        if (data && data.marketData && data.marketData.find((m: any) => m.exchange === 'Humble')) {
            const humblePrice = data.marketData.find((m: any) => m.exchange === 'Humble').price;
            updateVoiPrice(humblePrice, new Date(data.lastUpdated));
        }
        else if (data && data.aggregates && data.aggregates.weightedAveragePrice) {
            updateVoiPrice(data.aggregates.weightedAveragePrice, new Date(data.lastUpdated));
        }*/

		const response = await fetchFn(
			'https://voi-mainnet-mimirapi.voirewards.com/dex/pools?poolId=395553'
		);
		if (!response.ok) throw new Error('Failed to fetch VOI price');
		const data = await response.json();
		if (!data?.pools?.length) throw new Error('No VOI price data available');
		const pool = data.pools[0];
		const price = pool.tokenB.balance / pool.tokenA.balance;
		if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid VOI price');
		updateVoiPrice(price, new Date(pool.lastUpdated));
	} catch (error) {
		console.error('Error fetching VOI price:', error);
		voiPrice.update((current) => ({
			...current,
			error: error instanceof Error ? error.message : String(error)
		}));
	}
}
