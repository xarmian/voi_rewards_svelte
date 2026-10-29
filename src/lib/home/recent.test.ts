import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { createRecentBlocks, latest, type RecentState } from './recent';
import { config } from '$lib/config';

class Visibility extends EventTarget {
	visibilityState: DocumentVisibilityState = 'visible';
	change(state: DocumentVisibilityState) {
		this.visibilityState = state;
		this.dispatchEvent(new Event('visibilitychange'));
	}
}
const blocks = Array.from({ length: 10 }, (_, n) => ({
	proposer: `p${n}`,
	block: n,
	timestamp: new Date(n * 1000).toISOString(),
	votes: 1
}));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});
test('latest chooses the five newest without mutating the response', () => {
	assert.deepEqual(
		latest(blocks).map((b) => b.block),
		[9, 8, 7, 6, 5]
	);
	assert.equal(blocks[0].block, 0);
});
test('subscribe polls once; the next timer starts only after settlement; hide and unsubscribe stop polls', async () => {
	const document = new Visibility();
	let resolve!: (r: Response) => void;
	const fetch = vi.fn<typeof globalThis.fetch>(
		() =>
			new Promise((r) => {
				resolve = r;
			})
	);
	const store = createRecentBlocks({ fetch, document, now: Date.now });
	let state: RecentState | undefined;
	const unsubscribe = store.subscribe((value) => {
		state = value;
	});
	await vi.advanceTimersByTimeAsync(0);
	assert.equal(fetch.mock.calls.length, 1);
	assert.equal(fetch.mock.calls[0][0], `${config.proposalApiBaseUrl}?action=recent`);
	assert.ok(fetch.mock.calls[0][1]?.signal instanceof AbortSignal);
	await vi.advanceTimersByTimeAsync(90000);
	assert.equal(fetch.mock.calls.length, 1);
	resolve(Response.json(blocks));
	await vi.advanceTimersByTimeAsync(0);
	assert.equal(state?.blocks?.length, 5);
	await vi.advanceTimersByTimeAsync(29999);
	assert.equal(fetch.mock.calls.length, 1);
	document.change('hidden');
	await vi.advanceTimersByTimeAsync(60000);
	assert.equal(fetch.mock.calls.length, 1);
	document.change('visible');
	await vi.advanceTimersByTimeAsync(0);
	assert.equal(fetch.mock.calls.length, 2);
	unsubscribe();
	resolve(Response.json(blocks));
	await vi.advanceTimersByTimeAsync(90000);
	document.change('hidden');
	document.change('visible');
	await vi.advanceTimersByTimeAsync(0);
	assert.equal(fetch.mock.calls.length, 2);
});
test('hidden subscription waits for visibility and a failure keeps the last success', async () => {
	const document = new Visibility();
	document.change('hidden');
	const fetch = vi
		.fn<typeof globalThis.fetch>()
		.mockResolvedValueOnce(Response.json(blocks))
		.mockRejectedValue(new Error('offline'));
	const store = createRecentBlocks({ fetch, document, now: Date.now });
	let state!: RecentState;
	const unsubscribe = store.subscribe((value) => {
		state = value;
	});
	await vi.advanceTimersByTimeAsync(60000);
	assert.equal(fetch.mock.calls.length, 0);
	document.change('visible');
	await vi.advanceTimersByTimeAsync(0);
	const success = state;
	await vi.advanceTimersByTimeAsync(30000);
	assert.equal(state.error, true);
	assert.deepEqual(state.blocks, success.blocks);
	assert.equal(state.lastSuccess, success.lastSuccess);
	unsubscribe();
});
