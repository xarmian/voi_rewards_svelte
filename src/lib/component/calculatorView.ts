export const PRICE_STALE_MS = 15 * 60 * 1000;

export function priceLabel({
	useCustomPrice,
	marketPrice,
	error
}: {
	useCustomPrice: boolean;
	customPrice: number | null | undefined;
	marketPrice: number;
	error: string | null;
}): string {
	if (useCustomPrice) return 'Your price';
	if (error) return 'Unavailable';
	return Number.isFinite(marketPrice) && marketPrice > 0 ? 'VOI price (market)' : 'Loading...';
}

export function isNonnegative(value: unknown): boolean {
	return (
		(typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
		Number.isFinite(Number(value)) &&
		Number(value) >= 0
	);
}

export function validateStake(value: unknown): string | null {
	return isNonnegative(value) ? null : 'Enter a stake of 0 or more.';
}

export function validateCustomPrice(value: unknown): string | null {
	return isNonnegative(value) ? null : 'Enter a price of 0 or more.';
}

export function isPriceStale(lastUpdated: Date | null, now: Date): boolean {
	return lastUpdated !== null && now.getTime() - lastUpdated.getTime() > PRICE_STALE_MS;
}
