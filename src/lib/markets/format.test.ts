import { describe, expect, it } from 'vitest';
import {
	formatNumber,
	formatPrice,
	normalizeSymbol,
	normalizePair,
	formatCurrency,
	formatPercentage
} from './format';

describe('market formatting', () => {
	it.each([null, undefined])('renders missing numbers as a dash (%s)', (value) => {
		for (const format of [formatNumber, formatPrice, formatCurrency, formatPercentage]) {
			expect(format(value)).toBe('-');
		}
	});

	it('preserves zero, small prices, large numbers and decimal precision', () => {
		expect(formatNumber(0)).toBe('0.00');
		expect(formatPrice(0)).toBe('-');
		expect(formatCurrency(0)).toBe('$0.00');
		expect(formatPrice(0.001234)).toBe('$0.00123');
		expect(formatCurrency(0.001234)).toBe('$0.00');
		expect(formatNumber(1234567.891)).toBe('1,234,567.89');
		expect(formatNumber(1234567.891, 3)).toBe('1,234,567.891');
		expect(formatPrice(1234567.89)).toBe('$1,234,567.89000');
		expect(formatCurrency(1234567.89)).toBe('$1,234,567.89');
	});

	it('adds a plus only for positive percentages, even when rounded to zero', () => {
		expect(formatPercentage(2.345)).toBe('+2.35%');
		expect(formatPercentage(-2.345)).toBe('-2.35%');
		expect(formatPercentage(0)).toBe('0.00%');
		expect(formatPercentage(0.001)).toBe('+0.00%');
		expect(formatPercentage(-0.001)).toBe('-0.00%');
	});

	it('removes only a lowercase w before an uppercase character', () => {
		expect(normalizeSymbol('wVOI')).toBe('VOI');
		expect(normalizeSymbol('WVOI')).toBe('WVOI');
		expect(normalizeSymbol('word')).toBe('word');
		expect(normalizeSymbol('w')).toBe('w');
		expect(normalizeSymbol('')).toBe('');
		expect(normalizePair('wUNIT/wVOI')).toBe('UNIT/VOI');
		expect(normalizePair('')).toBe('');
		expect(normalizePair('VOI')).toBe('VOI/undefined');
		expect(normalizePair('A/B/C')).toBe('A/B');
	});
});
