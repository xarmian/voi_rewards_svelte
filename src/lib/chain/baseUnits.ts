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

/**
 * The balance in base units. A token carries its exact integer string (`balanceRaw`) because the
 * `balance` number rounds above 2^53; a missing or malformed string falls back to the number.
 */
export function exactBalance(token: { balance: number; balanceRaw?: string }): bigint {
	if (token.balanceRaw !== undefined && /^\d+$/.test(token.balanceRaw)) {
		return BigInt(token.balanceRaw);
	}
	return BigInt(Math.floor(token.balance));
}
