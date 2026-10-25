function isIntegerString(value: string): boolean {
	return value.length > 0 && !/\D/.test(value);
}

function parseInteger(value: string, min: number, max = Infinity): number | null {
	if (!isIntegerString(value)) return null;
	const number = Number(value);
	return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

export function validateBallastLookback(value: string | null): number | null {
	return value === null ? 5 : parseInteger(value, 1, 50);
}

export function validatePhase2Pagination(
	params: URLSearchParams
): { page: number; pageSize: number } | { error: string } {
	const page = parseInteger(params.get('page') ?? '1', 1);
	if (page === null) return { error: 'page must be an integer >= 1' };
	const pageSize = parseInteger(params.get('pageSize') ?? '1000', 1, 1000);
	if (pageSize === null) return { error: 'pageSize must be an integer between 1 and 1000' };
	return { page, pageSize };
}
