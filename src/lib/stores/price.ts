import { writable, get } from 'svelte/store';

interface PriceData {
    price: number;
    lastUpdated: Date | null;
}

export const voiPrice = writable<PriceData>({ price: 0, lastUpdated: new Date() });

export function updateVoiPrice(price: number, lastUpdated: Date) {
    voiPrice.set({ price, lastUpdated });
}

export async function fetchVoiPrice(refresh: boolean = false) {
    // If price is already set, don't fetch again
    const currentPrice = get(voiPrice);
    if (currentPrice.price > 0 && !refresh) return;

    voiPrice.set({ price: 0, lastUpdated: null });

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

        const response = await fetch('https://voi-mainnet-mimirapi.voirewards.com/dex/pools?poolId=395553');
        if (!response.ok) throw new Error('Failed to fetch VOI price');
        const data = await response.json();
        if (data && data.pools && data.pools.length > 0) {
            const pool = data.pools[0];
            const price = pool.tokenB.balance / pool.tokenA.balance;
            updateVoiPrice(price, new Date(pool.lastUpdated));
        }
    } catch (error) {
        console.error('Error fetching VOI price:', error);
        updateVoiPrice(0, new Date());
    }
} 