import { describe, expect, test } from 'vitest';
import { availability, breakEvenTile, resultsState, profitPercentageText } from './view';

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
