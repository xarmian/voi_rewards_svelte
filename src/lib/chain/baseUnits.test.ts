import { describe, expect, it } from 'vitest';
import { decimalToBaseUnits } from './baseUnits';

describe('decimalToBaseUnits', () => {
	it.each([
		['1', 6, 1000000n],
		['0.1234567', 6, 123456n],
		['0.000001', 6, 1n],
		['0.0000001', 6, 0n],
		['1.15', 2, 115n],
		['0.29', 2, 29n],
		['4.35', 2, 435n],
		['9007199254.740993', 6, 9007199254740993n],
		['123456789012345678901234567890.123456', 6, 123456789012345678901234567890123456n],
		['.5', 6, 500000n],
		['5.', 6, 5000000n],
		['007', 0, 7n],
		['1.9', 0, 1n],
		[' 2 ', 6, 2000000n],
		['1.50', 2, 150n],
		['0', 6, 0n]
	])('converts %j with %i decimals to %s exactly', (value, decimals, expected) => {
		expect(decimalToBaseUnits(value, decimals)).toBe(expected);
	});

	it.each(['', ' ', '-1', '+1', '1e-7', '1e3', 'abc', '1.2.3', '1 2', '.'])(
		'rejects invalid amount %j',
		(value) => {
			expect(() => decimalToBaseUnits(value, 6)).toThrow(/^Invalid amount/);
		}
	);

	it.each([-1, 1.5, NaN, Infinity])('rejects invalid decimals %s', (decimals) => {
		expect(() => decimalToBaseUnits('1', decimals)).toThrow(/^Invalid amount/);
	});
});
