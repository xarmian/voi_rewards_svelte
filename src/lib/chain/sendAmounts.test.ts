import { expect, test } from 'vitest';
import { decimalToBaseUnits } from './baseUnits';
import {
	baseUnitsToDecimal,
	isDecimalAmount,
	isDecimalNumber,
	splitEvenly,
	fitsBalance,
	multiplyDecimal
} from './sendAmounts';

test.each([
	[0n, 6, '0'],
	[1500000n, 6, '1.5'],
	[1n, 18, '0.000000000000000001'],
	[10n ** 30n + 1n, 18, '1000000000000.000000000000000001']
] as const)('formats %s at %i decimals', (units, decimals, expected) => {
	expect(baseUnitsToDecimal(units, decimals)).toBe(expected);
});

test('round trips exact base units across token precisions', () => {
	for (let d = 0; d <= 19; d++) {
		for (const u of [0n, 1n, 2n ** 53n + 1n, 10n ** 30n + 7n]) {
			expect(decimalToBaseUnits(baseUnitsToDecimal(u, d), d)).toBe(u);
		}
	}
});

test('rejects negative units and invalid decimals', () => {
	expect(() => baseUnitsToDecimal(-1n, 6)).toThrow();
	for (const decimals of [-1, 0.5, NaN, Infinity]) {
		expect(() => baseUnitsToDecimal(1n, decimals)).toThrow();
	}
});

test.each(['1e3', '0x10', '1,000', '', '  ', '-1', '0', '0.0'])(
	'rejects non-positive decimal %j',
	(value) => {
		expect(isDecimalAmount(value)).toBe(false);
	}
);
test.each(['1', '0.5', '.5', '5.', ' 0.000000000000000001 '])('accepts decimal %j', (value) => {
	expect(isDecimalAmount(value)).toBe(true);
});

test.each([
	['0', true],
	['0.00', true],
	[' 0.00 ', true],
	['1e3', false]
] as const)('decimal grammar classifies %j as %s', (value, expected) => {
	expect(isDecimalNumber(value)).toBe(expected);
});

test('splits in whole base units, dropping only the remainder', () => {
	expect(splitEvenly('1', 3, 6)).toBe('0.333333');
	expect(splitEvenly('0.0000003', 3, 7)).toBe('0.0000001');
	expect(splitEvenly('0.0000001', 3, 7)).toBeNull();
	for (const count of [0, -1, 1.5, NaN, Infinity]) expect(splitEvenly('1', count, 6)).toBeNull();
	for (const value of ['bad', '1e3', '-1', '0']) expect(splitEvenly(value, 3, 6)).toBeNull();
	expect(splitEvenly('1', 3, -1)).toBeNull();
});

test('checks repeated amounts against an exact balance', () => {
	expect(fitsBalance('1.152921504606846976', 1, 18, 2n ** 60n)).toBe(true);
	expect(fitsBalance('1.152921504606847', 1, 18, 2n ** 60n)).toBe(false);
	expect(fitsBalance('0.1', 3, 6, 300000n)).toBe(true);
	expect(fitsBalance('0.1', 3, 6, 299999n)).toBe(false);
	for (const value of ['bad', '1e3', '-1', '0', '0.0000001'])
		expect(fitsBalance(value, 1, 6, 1000000n)).toBe(false);
	for (const count of [-1, 1.5, NaN, Infinity])
		expect(fitsBalance('1', count, 6, 1000000n)).toBe(false);
	expect(fitsBalance('1', 1, -1, 1000000n)).toBe(false);
});

test('multiplies without drift or exponent notation', () => {
	expect(multiplyDecimal('0.1', 3, 1)).toBe('0.3');
	expect(multiplyDecimal('0.0000001', 3, 7)).toBe('0.0000003');
	expect(multiplyDecimal('9007199254740993', 3, 0)).toBe('27021597764222979');
	expect(multiplyDecimal('1', 0, 6)).toBe('0');
	for (const factor of [-1, 0.5, NaN, Infinity]) expect(multiplyDecimal('1', factor, 6)).toBeNull();
	for (const value of ['bad', '1e3', '-1', '']) expect(multiplyDecimal(value, 3, 6)).toBeNull();
	expect(multiplyDecimal('1', 3, -1)).toBeNull();
});
