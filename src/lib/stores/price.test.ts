import { test, beforeEach, afterEach, vi, expect } from 'vitest';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { voiPrice, updateVoiPrice, fetchVoiPriceWith, VOI_PRICE_TTL_MS } from './price.ts';

const previousDate = new Date('2026-10-20T12:00:00Z');
const newDate = '2026-10-25T12:00:00Z';
// TASK-91: the /api/voi-price response shape.
const priceResponse = (price: unknown = 0.0003) => Response.json({ price, lastUpdated: newDate });

beforeEach(() => updateVoiPrice(0.0002, previousDate));

function assertPreviousPriceWithError() {
	const value = get(voiPrice);
	assert.equal(value.price, 0.0002);
	assert.equal(value.lastUpdated, previousDate);
	assert.ok(value.error);
}

test('a rejected refresh preserves the last price and timestamp', async () => {
	await fetchVoiPriceWith(async () => { throw new Error('network unavailable'); }, true);
	assertPreviousPriceWithError();
	assert.equal(get(voiPrice).error, 'network unavailable');
});

test('a 500 refresh preserves the last price and timestamp', async () => {
	await fetchVoiPriceWith(async () => new Response(null, { status: 500 }), true);
	assertPreviousPriceWithError();
});

test('invalid prices and empty responses preserve the last price and timestamp', async () => {
	for (const response of [priceResponse(0), priceResponse(-3), priceResponse('n/a'), Response.json({}), new Response(null)]) {
		await fetchVoiPriceWith(async () => response, true);
		assertPreviousPriceWithError();
	}
});

test('a successful refresh sets the new price and date and clears an error', async () => {
	await fetchVoiPriceWith(async () => { throw new Error('offline'); }, true);
	await fetchVoiPriceWith(async () => priceResponse(), true);
	assert.deepEqual(get(voiPrice), { price: 0.0003, lastUpdated: new Date(newDate), error: null });
});

test('a refresh never emits a zero price', async () => {
	const prices: number[] = [];
	const unsubscribe = voiPrice.subscribe((value) => prices.push(value.price));
	try {
		await fetchVoiPriceWith(async () => priceResponse(), true);
		await fetchVoiPriceWith(async () => { throw new Error('offline'); }, true);
		assert.ok(prices.length >= 2);
		assert.ok(prices.every((price) => price > 0), JSON.stringify(prices));
	} finally {
		unsubscribe();
	}
});

test('an already-set price skips a fetch unless refreshed', async () => {
	await fetchVoiPriceWith(async () => { assert.fail('should not fetch'); });
	assert.equal(get(voiPrice).price, 0.0002);
});


afterEach(() => vi.restoreAllMocks());

test.each(['older first', 'newer first', 'older rejects'])(
	'TASK-30 refresh starts a new fetch and only the newest changes the store (%s)',
	async (order) => {
		let resolveOld!: (response: Response) => void;
		let rejectOld!: (error: Error) => void;
		let resolveNew!: (response: Response) => void;
		const older = new Promise<Response>((resolve, reject) => {
			resolveOld = resolve;
			rejectOld = reject;
		});
		const newer = new Promise<Response>((resolve) => (resolveNew = resolve));
		const fetchFn = vi.fn().mockReturnValueOnce(older).mockReturnValue(newer);
		const first = fetchVoiPriceWith(fetchFn, true);
		const forced = fetchVoiPriceWith(fetchFn, true);
		let joinedSettled = false;
		const joined = fetchVoiPriceWith(fetchFn).then(() => { joinedSettled = true; });
		try {
			await Promise.resolve();
			expect(fetchFn).toHaveBeenCalledTimes(2);
			if (order === 'older first') {
				resolveOld(priceResponse(0.0001));
				await first;
				expect(get(voiPrice).price).toBe(0.0002);
				expect(joinedSettled).toBe(false);
				let laterSettled = false;
				const later = fetchVoiPriceWith(fetchFn).then(() => { laterSettled = true; });
				await Promise.resolve();
				expect(laterSettled).toBe(false);
				resolveNew(priceResponse());
				await later;
			} else {
				resolveNew(priceResponse());
				await forced;
				expect(get(voiPrice).price).toBe(0.0003);
				if (order === 'older rejects') rejectOld(new Error('old request failed'));
				else resolveOld(priceResponse(0.0001));
			}
			await Promise.all([first, forced, joined]);
			expect(get(voiPrice)).toEqual({
				price: 0.0003, lastUpdated: new Date(newDate), error: null
			});
			expect(fetchFn).toHaveBeenCalledTimes(2);
		} finally {
			// TASK-30: drain both requests when the old sharing behavior fails the assertions.
			resolveOld(priceResponse(0.0001));
			resolveNew(priceResponse());
			await Promise.all([first, forced, joined]);
		}
	}
);

test('TASK-30 price expires using fetch time rather than pool.lastUpdated', async () => {
	let time = 1000;
	vi.spyOn(Date, 'now').mockImplementation(() => time);
	const fetchFn = vi.fn(async () => priceResponse());
	await fetchVoiPriceWith(fetchFn, true);
	time += 60_000 - 1;
	await fetchVoiPriceWith(fetchFn);
	expect(fetchFn).toHaveBeenCalledTimes(1);
	time++;
	await fetchVoiPriceWith(fetchFn);
	expect(fetchFn).toHaveBeenCalledTimes(2);
	expect(VOI_PRICE_TTL_MS).toBe(60_000);
});

test('TASK-91 reads the site-wide VWAP from /api/voi-price', async () => {
	const fetchFn = vi.fn(async () => priceResponse(0.000123587));
	await fetchVoiPriceWith(fetchFn, true);
	expect(fetchFn).toHaveBeenCalledWith('/api/voi-price');
	assert.deepEqual(get(voiPrice), { price: 0.000123587, lastUpdated: new Date(newDate), error: null });
});

test('TASK-91 an endpoint price of 0 on a cold store is unavailable, not a $0 price', async () => {
	voiPrice.set({ price: 0, lastUpdated: null, error: null });
	await fetchVoiPriceWith(async () => priceResponse(0), true);
	const value = get(voiPrice);
	assert.equal(value.price, 0);
	assert.equal(value.error, 'VOI price unavailable');
});
