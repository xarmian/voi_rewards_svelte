import { decimalAmountPattern, decimalToBaseUnits } from './baseUnits';

/** Format non-negative base units without rounding or exponent notation. */
export function baseUnitsToDecimal(units: bigint, decimals: number): string {
	if (!Number.isInteger(decimals) || decimals < 0) {
		throw new Error('Invalid amount: decimals must be a non-negative integer');
	}
	if (units < 0n) throw new Error('Invalid amount: units must be non-negative');
	if (decimals === 0) return units.toString();
	const digits = units.toString().padStart(decimals + 1, '0');
	const whole = digits.slice(0, -decimals);
	const fraction = digits.slice(-decimals).replace(/0+$/, '');
	return fraction ? `${whole}.${fraction}` : whole;
}

/** Check decimal syntax, including zero, for imported column detection. */
export function isDecimalNumber(value: string): boolean {
	return decimalAmountPattern.test(value.trim());
}

/** Check positivity in the typed decimal, before any token-precision truncation. */
export function isDecimalAmount(value: string): boolean {
	const trimmed = value.trim();
	return decimalAmountPattern.test(trimmed) && /[1-9]/.test(trimmed);
}

export function splitEvenly(total: string, count: number, decimals: number): string | null {
	if (!Number.isInteger(count) || count < 1) return null;
	try {
		const share = decimalToBaseUnits(total, decimals) / BigInt(count);
		return share > 0n ? baseUnitsToDecimal(share, decimals) : null;
	} catch {
		return null;
	}
}

export function fitsBalance(
	amountEach: string,
	count: number,
	decimals: number,
	balance: bigint
): boolean {
	if (!Number.isInteger(count) || count < 0) return false;
	try {
		const amount = decimalToBaseUnits(amountEach, decimals);
		return amount > 0n && amount * BigInt(count) <= balance;
	} catch {
		return false;
	}
}

export function multiplyDecimal(value: string, factor: number, decimals: number): string | null {
	if (!Number.isInteger(factor) || factor < 0) return null;
	try {
		return baseUnitsToDecimal(decimalToBaseUnits(value, decimals) * BigInt(factor), decimals);
	} catch {
		return null;
	}
}
