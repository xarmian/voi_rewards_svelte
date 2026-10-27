import { afterEach, beforeEach, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createChainStatus, freshness, type ChainStatus } from './chainStatus';

const initial: ChainStatus = {
	round: null,
	lastRoundAt: null,
	lastChangeAt: null,
	error: false,
	checkedAt: null,
	startedAt: null
};
const start = Date.UTC(2026, 9, 27);
const response = (round = 123, ageMs = 3000) =>
	new Response(
		JSON.stringify({
			'last-round': round,
			'time-since-last-round': ageMs * 1_000_000
		})
	);
function setup(visible = true) {
	const document = Object.assign(new EventTarget(), {
		visibilityState: (visible ? 'visible' : 'hidden') as Document['visibilityState']
	});
	const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response());
	const store = createChainStatus({ fetch, now: Date.now, document });
	let state = initial;
	const stop = store.subscribe((value) => {
		state = value;
	});
	return {
		document,
		fetch,
		stop,
		state: () => state,
		visibility(value: Document['visibilityState']) {
			document.visibilityState = value;
			document.dispatchEvent(new Event('visibilitychange'));
		}
	};
}
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(start);
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

test('SSR stays initial and never polls', () => {
	const fetch = vi.fn<typeof globalThis.fetch>();
	assert.deepEqual(get(createChainStatus({ fetch })), initial);
	assert.equal(fetch.mock.calls.length, 0);
});
test('polls immediately and stops after unsubscribe', async () => {
	const context = setup();
	assert.equal(context.fetch.mock.calls.length, 1);
	await vi.advanceTimersByTimeAsync(0);
	assert.equal(context.state().round, 123);
	assert.equal(context.state().lastRoundAt, start - 3000);
	assert.equal(context.state().lastChangeAt, start - 3000);
	assert.equal(context.state().checkedAt, start);
	assert.equal(context.state().startedAt, start);
	assert.equal(freshness(context.state(), start).tone, 'ok');
	assert.equal(context.fetch.mock.calls[0][0], 'https://mainnet-api.voi.nodely.dev/v2/status');
	assert.ok(context.fetch.mock.calls[0][1]?.signal instanceof AbortSignal);
	await vi.advanceTimersByTimeAsync(30_000);
	assert.equal(context.fetch.mock.calls.length, 2);
	context.stop();
	await vi.advanceTimersByTimeAsync(90_000);
	assert.equal(context.fetch.mock.calls.length, 2);
});
test('a slow request cannot overlap polls or visibility resumes', async () => {
	let resolve!: (value: Response) => void;
	const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
		() =>
			new Promise((r) => {
				resolve = r;
			})
	);
	const document = Object.assign(new EventTarget(), {
		visibilityState: 'visible' as Document['visibilityState']
	});
	const store = createChainStatus({ fetch, now: Date.now, document });
	const stop = store.subscribe(() => undefined);
	const stopSecond = store.subscribe(() => undefined);
	await vi.advanceTimersByTimeAsync(90_000);
	document.dispatchEvent(new Event('visibilitychange'));
	assert.equal(fetch.mock.calls.length, 1);
	resolve(response());
	await vi.advanceTimersByTimeAsync(0);
	await vi.advanceTimersByTimeAsync(29_999);
	assert.equal(fetch.mock.calls.length, 1);
	await vi.advanceTimersByTimeAsync(1);
	assert.equal(fetch.mock.calls.length, 2);
	stop();
	stopSecond();
	resolve(response());
	await vi.advanceTimersByTimeAsync(60_000);
	assert.equal(fetch.mock.calls.length, 2);
});
test('hidden tabs do not poll, visibility resumes immediately, and stop removes the listener', async () => {
	const context = setup(false);
	const remove = vi.spyOn(context.document, 'removeEventListener');
	await vi.advanceTimersByTimeAsync(60_000);
	assert.equal(context.fetch.mock.calls.length, 0);
	context.visibility('visible');
	assert.equal(context.fetch.mock.calls.length, 1);
	await vi.advanceTimersByTimeAsync(0);
	context.visibility('hidden');
	await vi.advanceTimersByTimeAsync(60_000);
	assert.equal(context.fetch.mock.calls.length, 1);
	context.visibility('visible');
	assert.equal(context.fetch.mock.calls.length, 2);
	await vi.advanceTimersByTimeAsync(0);
	context.stop();
	assert.equal(remove.mock.calls[0][0], 'visibilitychange');
	context.visibility('visible');
	await vi.advanceTimersByTimeAsync(60_000);
	assert.equal(context.fetch.mock.calls.length, 2);
});
test('unchanged rounds become stale, failed polls keep the last data, and a new round recovers', async () => {
	const context = setup();
	await vi.advanceTimersByTimeAsync(7 * 60_000);
	assert.equal(context.state().lastChangeAt, start - 3000);
	assert.deepEqual(freshness(context.state(), Date.now()), {
		tone: 'warn',
		minutesOld: 7,
		unavailable: false
	});
	context.fetch.mockRejectedValueOnce(new Error('offline'));
	await vi.advanceTimersByTimeAsync(30_000);
	assert.equal(context.state().round, 123);
	assert.equal(context.state().error, true);
	assert.equal(context.state().checkedAt, Date.now());
	context.fetch.mockResolvedValueOnce(response(124));
	await vi.advanceTimersByTimeAsync(30_000);
	assert.equal(context.state().error, false);
	assert.equal(context.state().lastChangeAt, Date.now() - 3000);
	assert.equal(freshness(context.state(), Date.now()).tone, 'ok');
	context.stop();
});
test('no successful poll is neutral until more than five minutes after start', async () => {
	assert.deepEqual(freshness(initial, start), {
		tone: 'neutral',
		minutesOld: null,
		unavailable: false
	});
	const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('offline'));
	const document = Object.assign(new EventTarget(), {
		visibilityState: 'visible' as Document['visibilityState']
	});
	let state = initial;
	const stop = createChainStatus({ fetch, now: Date.now, document }).subscribe((value) => {
		state = value;
	});
	await vi.advanceTimersByTimeAsync(5 * 60_000);
	assert.equal(freshness(state, Date.now()).tone, 'neutral');
	await vi.advanceTimersByTimeAsync(30_000);
	assert.deepEqual(freshness(state, Date.now()), {
		tone: 'warn',
		minutesOld: null,
		unavailable: true
	});
	assert.equal(state.round, null);
	stop();
});
test('freshness threshold is inclusive and configurable', () => {
	const state = { ...initial, round: 1, lastChangeAt: start };
	assert.equal(freshness(state, start + 300_000).tone, 'ok');
	assert.equal(freshness(state, start + 300_001).tone, 'warn');
	assert.equal(freshness(state, start + 1001, 1000).tone, 'warn');
});

for (const [ageMs, tone, minutesOld] of [
	[600_000, 'warn', 10],
	[3000, 'ok', 0]
] as const) {
	test(`first poll accounts for a round produced ${ageMs} ms ago`, async () => {
		const context = setup(false);
		context.fetch.mockResolvedValueOnce(response(123, ageMs));
		context.visibility('visible');
		await vi.advanceTimersByTimeAsync(0);
		assert.deepEqual(freshness(context.state(), Date.now()), {
			tone,
			minutesOld,
			unavailable: false
		});
		assert.equal(context.state().lastChangeAt, start - ageMs);
		context.stop();
	});
}
test('unsubscribing aborts an in-flight poll and clears its timeout', async () => {
	const context = setup(false);
	context.fetch.mockImplementation(
		(_url, options) =>
			new Promise((_resolve, reject) => {
				options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
			})
	);
	context.visibility('visible');
	const signal = context.fetch.mock.calls[0][1]?.signal;
	assert.equal(signal?.aborted, false);
	context.stop();
	assert.equal(signal?.aborted, true);
	await vi.advanceTimersByTimeAsync(0);
	assert.equal(vi.getTimerCount(), 0);
	await vi.advanceTimersByTimeAsync(60_000);
	assert.equal(context.fetch.mock.calls.length, 1);
});
test('the poll timeout aborts at ten seconds and schedules a later retry', async () => {
	const context = setup(false);
	context.fetch.mockImplementation(
		(_url, options) =>
			new Promise((_resolve, reject) => {
				options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
			})
	);
	context.visibility('visible');
	const signal = context.fetch.mock.calls[0][1]?.signal;
	await vi.advanceTimersByTimeAsync(9999);
	assert.equal(signal?.aborted, false);
	await vi.advanceTimersByTimeAsync(1);
	assert.equal(signal?.aborted, true);
	assert.equal(context.state().error, true);
	await vi.advanceTimersByTimeAsync(30_000);
	assert.equal(context.fetch.mock.calls.length, 2);
	context.stop();
	await vi.advanceTimersByTimeAsync(0);
	assert.equal(vi.getTimerCount(), 0);
});
