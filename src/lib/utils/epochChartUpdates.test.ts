import { expect, test } from 'vitest';
import { getEpochChartUpdates } from './epochChartUpdates';

const inputs = { epochs: [{ apr: 12 }], priceHistory: [{ value: 0.001 }], dark: false };
const all = { apr: true, stake: true, price: true };
const none = { apr: false, stake: false, price: false };

test('initial data and a theme change update all three charts', () => {
	expect(getEpochChartUpdates(null, inputs)).toEqual(all);
	expect(getEpochChartUpdates(inputs, { ...inputs, dark: true })).toEqual(all);
});

test.each([
	{ txPeriod: 'week' },
	{ txLoading: true },
	{ transactionData: [{ bucket_start: '2026-10-25', tx_count: 100 }] }
])('transaction state changes do not update APR, stake or price: %j', (change) => {
	const previous = { ...inputs, txPeriod: 'day', txLoading: false, transactionData: [] };
	const next = { ...previous, ...change };
	expect(getEpochChartUpdates(previous, next)).toEqual(none);
});

test('epoch data updates only APR and stake, and price history updates only price', () => {
	expect(getEpochChartUpdates(inputs, { ...inputs, epochs: [{ apr: 13 }] })).toEqual({
		apr: true,
		stake: true,
		price: false
	});
	expect(getEpochChartUpdates(inputs, { ...inputs, priceHistory: [{ value: 0.002 }] })).toEqual({
		apr: false,
		stake: false,
		price: true
	});
});
