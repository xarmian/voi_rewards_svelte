import { writable, get } from 'svelte/store';

interface PriceData {
	price: number;
	lastUpdated: Date | null;
	error: string | null;
}

export const voiPrice = writable<PriceData>({ price: 0, lastUpdated: null, error: null });

// TASK-91: matches /api/voi-price's CDN cache (CACHE_TTL['voi-price'].sMaxAge = 60 s); polling faster sees no new data.
export const VOI_PRICE_TTL_MS = 60_000;
let fetchedAt: number | null = null;
let inFlight: Promise<void> | null = null;
let requestSequence = 0;

export function updateVoiPrice(price: number, lastUpdated: Date) {
	fetchedAt = Date.now();
	voiPrice.set({ price, lastUpdated, error: null });
}

export async function fetchVoiPrice(refresh: boolean = false) {
	return fetchVoiPriceWith(fetch, refresh);
}

export async function fetchVoiPriceWith(
	fetchFn: (url: string) => Promise<Response>,
	refresh = false
) {
	// TASK-30: refresh starts a new fetch; ordinary callers join the newest request.
	if (!refresh && inFlight) return inFlight;
	const currentPrice = get(voiPrice);
	if (currentPrice.price > 0 && fetchedAt !== null && Date.now() - fetchedAt < VOI_PRICE_TTL_MS && !refresh) return;

	const sequence = ++requestSequence;
	inFlight = Promise.resolve().then(async () => {
		try {
			// TASK-91: the same cross-venue VWAP as /api/markets voiUsd, so the site shows one VOI price.
			const response = await fetchFn('/api/voi-price');
			if (!response.ok) throw new Error('Failed to fetch VOI price');
			const data = await response.json();
			const price = Number(data?.price);
			// The endpoint answers price 0 when it has no data: that is unavailable, never $0.
			if (!Number.isFinite(price) || price <= 0) throw new Error('VOI price unavailable');
			const lastUpdated = new Date(data.lastUpdated);
			// TASK-30: an older request cannot replace a newer price or error.
			if (sequence === requestSequence)
				updateVoiPrice(price, Number.isFinite(lastUpdated.getTime()) ? lastUpdated : new Date());
		} catch (error) {
			console.error('Error fetching VOI price:', error);
			if (sequence === requestSequence) {
				voiPrice.update((current) => ({
					...current,
					error: error instanceof Error ? error.message : String(error)
				}));
			}
		}
	}).finally(() => {
		if (sequence === requestSequence) inFlight = null;
	});
	return inFlight;
}
