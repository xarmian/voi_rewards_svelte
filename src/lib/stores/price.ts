import { writable, get } from 'svelte/store';

interface PriceData {
	price: number;
	lastUpdated: Date | null;
	error: string | null;
}

export const voiPrice = writable<PriceData>({ price: 0, lastUpdated: null, error: null });

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
			const response = await fetchFn(
				'https://voi-mainnet-mimirapi.voirewards.com/dex/pools?poolId=395553'
			);
			if (!response.ok) throw new Error('Failed to fetch VOI price');
			const data = await response.json();
			if (!data?.pools?.length) throw new Error('No VOI price data available');
			const pool = data.pools[0];
			const price = pool.tokenB.balance / pool.tokenA.balance;
			if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid VOI price');
			// TASK-30: an older request cannot replace a newer price or error.
			if (sequence === requestSequence) updateVoiPrice(price, new Date(pool.lastUpdated));
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
