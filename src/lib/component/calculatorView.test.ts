import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
	availability,
	breakEvenTile,
	isPriceStale,
	PRICE_STALE_MS,
	priceLabel,
	resultsState,
	profitPercentageText,
	validateCustomPrice,
	validateNodeCost,
	validateStake
} from './calculatorView';

describe('resultsState', () => {
	for (const isLoading of [false, true]) {
		for (const loadFailed of [false, true]) {
			for (const hasEstimate of [false, true]) {
				test(`${JSON.stringify({ isLoading, loadFailed, hasEstimate })}`, () => {
					expect(resultsState({ isLoading, loadFailed, hasEstimate })).toBe(
						isLoading ? 'loading' : loadFailed || !hasEstimate ? 'unavailable' : 'ready'
					);
				});
			}
		}
	}
});

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

describe('availability', () => {
	test.each([0, 0.002, NaN, Infinity])(
		'a null estimate has no figures at price %s',
		(effectivePrice) => {
			expect(availability({ hasEstimate: false, effectivePrice })).toEqual({
				voiEstimates: false,
				usdFigures: false,
				breakEven: false
			});
		}
	);
	test.each([0, -1, NaN, Infinity])(
		'retains VOI figures without a usable price %s',
		(effectivePrice) => {
			expect(availability({ hasEstimate: true, effectivePrice })).toEqual({
				voiEstimates: true,
				usdFigures: false,
				breakEven: false
			});
		}
	);
	test('a valid estimate and positive custom or market price make all figures available', () => {
		expect(availability({ hasEstimate: true, effectivePrice: 0.002 })).toEqual({
			voiEstimates: true,
			usdFigures: true,
			breakEven: true
		});
	});
});

test('price freshness uses only a real timestamp and becomes stale after fifteen minutes', () => {
	const now = new Date('2026-11-06T12:00:00Z');
	expect(PRICE_STALE_MS).toBe(15 * 60 * 1000);
	expect(isPriceStale(null, now)).toBe(false);
	expect(isPriceStale(new Date('invalid'), now)).toBe(false);
	expect(isPriceStale(new Date(now.getTime() - PRICE_STALE_MS), now)).toBe(false);
	expect(isPriceStale(new Date(now.getTime() - PRICE_STALE_MS - 1), now)).toBe(true);
});

const source = readFileSync(new URL('./CalculatorComponent.svelte', import.meta.url), 'utf8');
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

describe('profitPercentageText', () => {
	test('shows both percentages for a positive node cost', () => {
		expect(profitPercentageText(10, 12.345, -98.32)).toBe(
			'12.35% monthly / -98.32% yearly profit on node cost'
		);
	});
	test.each([0, -0, NaN, Infinity, -1])('omits the percentage when node cost is %s', (cost) => {
		expect(profitPercentageText(cost, 0, 0)).toBeUndefined();
	});
});

describe('breakEvenTile', () => {
	const input = { hasEstimate: true, effectivePrice: 0.01, reached: true, threshold: 20300 };

	test('a reached break-even shows its figure, USD detail and use button', () => {
		expect(breakEvenTile(input)).toEqual({
			value: (20300).toLocaleString(),
			unit: 'VOI',
			detail: '$203.00',
			showUseButton: true
		});
	});

	test('an unreached break-even shows the search limit without USD detail or use button', () => {
		expect(breakEvenTile({ ...input, reached: false, threshold: 10_000_000 })).toEqual({
			value: `More than ${(10_000_000).toLocaleString()}`,
			unit: 'VOI',
			detail: undefined,
			showUseButton: false
		});
	});

	test.each([0, -1, NaN, Infinity])(
		'no usable price %s preserves the unavailable text',
		(effectivePrice) => {
			for (const reached of [true, false]) {
				expect(breakEvenTile({ ...input, effectivePrice, reached })).toEqual({
					value: 'Unavailable',
					unit: undefined,
					detail: 'Unavailable without a price',
					showUseButton: false
				});
			}
		}
	);

	test('no estimate shows unavailable without a use button', () => {
		for (const effectivePrice of [0, 0.01]) {
			expect(breakEvenTile({ ...input, hasEstimate: false, effectivePrice })).toEqual({
				value: 'Unavailable',
				unit: undefined,
				detail: undefined,
				showUseButton: false
			});
		}
	});
});

test('the component delegates the break-even tile and button condition to the pure helper', () => {
	expect(source).toMatch(/\$:\s*shownBreakEven\s*=\s*breakEvenTile\(/);
	for (const field of ['value', 'unit', 'detail']) {
		expect(source).toContain(`${field}={shownBreakEven.${field}}`);
	}
	expect(source).toContain('{#if shownBreakEven.showUseButton}');
	expect(source).not.toMatch(/figures\.breakEven\s*&&\s*estimate/);
	expect(source).not.toContain('estimate.profitabilityThreshold.toLocaleString()');
	expect(source).not.toContain('formatUSD(estimate.profitabilityThreshold * effectivePrice)');
});
