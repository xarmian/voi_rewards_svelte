import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
	isPriceStale,
	PRICE_STALE_MS,
	priceLabel,
	validateCustomPrice,
	validateStake
} from './calculatorView';
import { validateNodeCost } from '$lib/epochRewards/calculator/view';

describe('priceLabel', () => {
	test('a custom price is clearly labelled even when the market fetch failed', () => {
		expect(
			priceLabel({ useCustomPrice: true, customPrice: 0.002, marketPrice: 0, error: 'failed' })
		).toBe('Your price');
	});
	test('market, error and loading labels', () => {
		const input = { useCustomPrice: false, customPrice: null, marketPrice: 0.002, error: null };
		expect(priceLabel(input)).toBe('VOI price (market)');
		expect(priceLabel({ ...input, error: 'failed' })).toBe('Unavailable');
		for (const marketPrice of [0, -1, NaN, Infinity]) {
			expect(priceLabel({ ...input, marketPrice })).toBe('Loading...');
		}
	});
});

for (const [name, validate, message] of [
	['stake', validateStake, 'Enter a stake of 0 or more.'],
	['monthly cost', validateNodeCost, 'Enter a monthly cost of 0 or more.'],
	['custom price', validateCustomPrice, 'Enter a price of 0 or more.']
] as const) {
	describe(`${name} validation`, () => {
		test.each([-1, NaN, Infinity, -Infinity, '', '  ', undefined, null])('rejects %s', (value) => {
			expect(validate(value)).toBe(message);
		});
		test.each([0, 0.5, 1000, '0', '0.5', '1000'])('accepts %s', (value) => {
			expect(validate(value)).toBeNull();
		});
	});
}

test('price freshness uses only a real timestamp and becomes stale after fifteen minutes', () => {
	const now = new Date('2026-11-06T12:00:00Z');
	expect(PRICE_STALE_MS).toBe(15 * 60 * 1000);
	expect(isPriceStale(null, now)).toBe(false);
	expect(isPriceStale(new Date('invalid'), now)).toBe(false);
	expect(isPriceStale(new Date(now.getTime() - PRICE_STALE_MS), now)).toBe(false);
	expect(isPriceStale(new Date(now.getTime() - PRICE_STALE_MS - 1), now)).toBe(true);
});

// The calculator's markup is split between the component and the epoch module's slots.
const source = [
	'./CalculatorComponent.svelte',
	'../epochRewards/calculator/EpochEstimate.svelte',
	'../epochRewards/calculator/EpochSchedule.svelte',
	'../epochRewards/calculator/EpochNodeCost.svelte'
]
	.map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
	.join('\n');
test('shared calculator uses the design system, original model and view helpers', () => {
	for (const module of ['$lib/ds', '$lib/rewards/calculatorModel', './calculatorView']) {
		expect(source).toContain(`from '${module}'`);
	}
	for (const prop of ['walletAddress', 'childAccounts', 'primaryAccountInfo']) {
		expect(source).toMatch(new RegExp(`export let ${prop}\\b`));
	}
});
test('calculator removes recommendations, legacy palette and whole-component loading/error replacements', () => {
	for (const text of [
		'Nautilus',
		'nautilus.sh',
		'bg-purple-',
		'text-purple-',
		'border-purple-',
		'from-purple-',
		'to-pink-',
		'bg-gray-',
		'dark:bg-gray-',
		'fas fa-',
		'Loading calculator data...',
		'{#if error}'
	]) {
		expect(source).not.toContain(text);
	}
	expect(source).toContain('loadData');
	expect(source).toContain('Your price');
});

test('the component delegates the break-even tile and button condition to the pure helper', () => {
	expect(source).toMatch(/shownBreakEven\s*=\s*\$derived\(\s*breakEvenTile\(/);
	for (const field of ['value', 'unit', 'detail']) {
		expect(source).toContain(`${field}={shownBreakEven.${field}}`);
	}
	expect(source).toContain('{#if shownBreakEven.showUseButton}');
	expect(source).not.toMatch(/figures\.breakEven\s*&&\s*estimate/);
	expect(source).not.toContain('estimate.profitabilityThreshold.toLocaleString()');
	expect(source).not.toContain('formatUSD(estimate.profitabilityThreshold * effectivePrice)');
});
