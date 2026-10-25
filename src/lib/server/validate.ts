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
