// Format number with commas and specified decimal places
export const formatNumber = (num: number | null | undefined, decimals: number = 2): string => {
	if (num === null || num === undefined) return '-';
	const n = Number(num);
	return n.toLocaleString('en-US', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	});
};

// Format price with 5 decimal places
export const formatPrice = (num: number | null | undefined): string => {
	if (num === null || num === undefined || num === 0) return '-';
	return `$${formatNumber(num, 5)}`;
};

// Normalize token symbol - remove lowercase 'w' prefix (e.g., wVOI -> VOI, wUNIT -> UNIT)
export const normalizeSymbol = (symbol: string): string => {
	if (
		symbol &&
		symbol.length > 1 &&
		symbol.startsWith('w') &&
		symbol[1] === symbol[1].toUpperCase()
	) {
		return symbol.slice(1);
	}
	return symbol;
};

// Normalize pair name (e.g., "wUNIT/wVOI" -> "UNIT/VOI")
export const normalizePair = (pair: string): string => {
	if (!pair) return pair;
	const [base, quote] = pair.split('/');
	return `${normalizeSymbol(base)}/${normalizeSymbol(quote)}`;
};

// Format currency with $ symbol and 2 decimal places (for volume/TVL)
export const formatCurrency = (num: number | null | undefined): string => {
	if (num === null || num === undefined) return '-';
	return `$${formatNumber(num, 2)}`;
};

// Format percentage
export const formatPercentage = (num: number | null | undefined): string => {
	if (num === null || num === undefined) return '-';
	const formatted = formatNumber(num, 2);
	if (formatted === '-') return '-';
	const sign = Number(num) > 0 ? '+' : '';
	return `${sign}${formatted}%`;
};
