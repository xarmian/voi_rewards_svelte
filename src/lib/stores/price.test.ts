import { test, beforeEach, afterEach, vi, expect } from 'vitest';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { voiPrice, updateVoiPrice, fetchVoiPriceWith, VOI_PRICE_TTL_MS } from './price.ts';

const previousDate = new Date('2026-10-20T12:00:00Z');
const newDate = '2026-10-25T12:00:00Z';
const poolResponse = (balanceA = 10000, balanceB = 3) => Response.json({
	pools: [{ tokenA: { balance: balanceA }, tokenB: { balance: balanceB }, lastUpdated: newDate }]
});

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
	for (const response of [poolResponse(0), poolResponse(10000, 0), poolResponse(10000, -3), Response.json({ pools: [] }), new Response(null)]) {
		await fetchVoiPriceWith(async () => response, true);
		assertPreviousPriceWithError();
	}
});

test('a successful refresh sets the new price and date and clears an error', async () => {
	await fetchVoiPriceWith(async () => { throw new Error('offline'); }, true);
	await fetchVoiPriceWith(async () => poolResponse(), true);
	assert.deepEqual(get(voiPrice), { price: 0.0003, lastUpdated: new Date(newDate), error: null });
});

test('a refresh never emits a zero price', async () => {
	const prices: number[] = [];
	const unsubscribe = voiPrice.subscribe((value) => prices.push(value.price));
	try {
		await fetchVoiPriceWith(async () => poolResponse(), true);
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

test('TASK-30 concurrent refresh callers share one fetch and both see the updated store', async () => {
	let resolve!: (response: Response) => void;
	const fetchFn = vi.fn(() => new Promise<Response>((done) => (resolve = done)));
	const first = fetchVoiPriceWith(fetchFn, true);
	const second = fetchVoiPriceWith(fetchFn, true);
	await Promise.resolve();
	expect(fetchFn).toHaveBeenCalledTimes(1);
	resolve(poolResponse());
	await Promise.all([first, second].map(async (pending) => {
		await pending;
		expect(get(voiPrice).price).toBe(0.0003);
	}));
});

test('TASK-30 price expires using fetch time rather than pool.lastUpdated', async () => {
	expect(VOI_PRICE_TTL_MS).toBe(60_000);
	let time = 1000;
	vi.spyOn(Date, 'now').mockImplementation(() => time);
	const fetchFn = vi.fn(async () => poolResponse());
	await fetchVoiPriceWith(fetchFn, true);
	time += VOI_PRICE_TTL_MS - 1;
	await fetchVoiPriceWith(fetchFn);
	expect(fetchFn).toHaveBeenCalledTimes(1);
	time++;
	await fetchVoiPriceWith(fetchFn);
	expect(fetchFn).toHaveBeenCalledTimes(2);
});
