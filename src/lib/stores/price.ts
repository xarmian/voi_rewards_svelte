import { writable, get } from 'svelte/store';

export const voiPrice = writable(0);

export function updateVoiPrice(price: number) {
    voiPrice.set(price);
}

export async function fetchVoiPrice() {
    // If price is already set, don't fetch again
    if (get(voiPrice) > 0) return;

    try {
        const response = await fetch('/api/voi-price');
        if (!response.ok) throw new Error('Failed to fetch VOI price');
        const data = await response.json();
        updateVoiPrice(data.price);
    } catch (error) {
        console.error('Error fetching VOI price:', error);
        updateVoiPrice(0);
    }
} 