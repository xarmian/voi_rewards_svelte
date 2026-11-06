export const PRICE_STALE_MS = 15 * 60 * 1000;

export function resultsState({
	isLoading,
	loadFailed,
	hasEstimate
}: {
	isLoading: boolean;
	loadFailed: boolean;
	hasEstimate: boolean;
}): 'loading' | 'unavailable' | 'ready' {
	return isLoading ? 'loading' : loadFailed || !hasEstimate ? 'unavailable' : 'ready';
}

export function availability({
	hasEstimate,
	effectivePrice
}: {
	hasEstimate: boolean;
	effectivePrice: number;
}) {
	const hasPrice = Number.isFinite(effectivePrice) && effectivePrice > 0;
	return {
		voiEstimates: hasEstimate,
		usdFigures: hasEstimate && hasPrice,
		breakEven: hasEstimate && hasPrice
	};
}

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

function isNonnegative(value: unknown): boolean {
	return (
		(typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
		Number.isFinite(Number(value)) &&
		Number(value) >= 0
	);
}

export function validateStake(value: unknown): string | null {
	return isNonnegative(value) ? null : 'Enter a stake of 0 or more.';
}

export function validateNodeCost(value: unknown): string | null {
	return isNonnegative(value) ? null : 'Enter a monthly cost of 0 or more.';
}

export function isPriceStale(lastUpdated: Date | null, now: Date): boolean {
	return lastUpdated !== null && now.getTime() - lastUpdated.getTime() > PRICE_STALE_MS;
}
