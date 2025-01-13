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
        const response = await fetch('/api/voi-price');
        if (!response.ok) throw new Error('Failed to fetch VOI price');
        const data = await response.json();
        updateVoiPrice(data.price, new Date(data.lastUpdated));
    } catch (error) {
        console.error('Error fetching VOI price:', error);
        updateVoiPrice(0, new Date());
    }
} 