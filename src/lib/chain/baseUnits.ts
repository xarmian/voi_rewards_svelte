export function decimalToBaseUnits(value: string, decimals: number): bigint {
	if (!Number.isInteger(decimals) || decimals < 0) {
		throw new Error('Invalid amount: decimals must be a non-negative integer');
	}

	const trimmed = value.trim();
	if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) {
		throw new Error('Invalid amount: expected a decimal string');
	}

	const [whole, fraction = ''] = trimmed.split('.');
	return BigInt(`${whole || '0'}${fraction.slice(0, decimals).padEnd(decimals, '0')}`);
}

/** Exact total of typed decimal strings in base units. Blank rows count as zero; invalid ones throw. */
export function sumBaseUnits(values: string[], decimals: number): bigint {
	return values.reduce(
		(sum, value) => (value.trim() === '' ? sum : sum + decimalToBaseUnits(value, decimals)),
		0n
	);
}
