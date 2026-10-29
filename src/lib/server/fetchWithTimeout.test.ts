import { afterEach, expect, it, vi } from 'vitest';
import { fetchWithTimeout, withDeadline } from './fetchWithTimeout';

afterEach(() => vi.useRealTimers());
it('bounds even a fetch that ignores abort, aborts its signal, and strips helper options', async () => {
	vi.useFakeTimers();
	const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
	const pending = fetchWithTimeout('/slow', { timeoutMs: 4000, fetch: fetcher, cache: 'no-store' });
	const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
	await vi.advanceTimersByTimeAsync(4100);
	await rejected;
	const options = fetcher.mock.calls[0][1]!;
	expect(options.signal?.aborted).toBe(true);
	expect(options).not.toHaveProperty('timeoutMs');
	expect(options).not.toHaveProperty('fetch');
	expect(options.cache).toBe('no-store');
	expect(vi.getTimerCount()).toBe(0);
});
it('preserves caller cancellation and cleans up the deadline', async () => {
	vi.useFakeTimers();
	const caller = new AbortController();
	const pending = fetchWithTimeout('/slow', {
		timeoutMs: 4000,
		signal: caller.signal,
		fetch: () => new Promise(() => {})
	});
	const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
	caller.abort();
	await rejected;
	expect(vi.getTimerCount()).toBe(0);
});
it('returns the response and clears the timer on success', async () => {
	vi.useFakeTimers();
	const response = Response.json({ ok: true });
	expect(await fetchWithTimeout('/ok', { timeoutMs: 4000, fetch: async () => response })).toBe(
		response
	);
	expect(vi.getTimerCount()).toBe(0);
});

it('withDeadline bounds a run that ignores abort and rejects with the signal reason', async () => {
	vi.useFakeTimers();
	const run = vi.fn<(signal: AbortSignal) => Promise<never>>(() => new Promise(() => {}));
	const pending = withDeadline(run, 3000);
	const rejected = expect(pending).rejects.toMatchObject({
		name: 'TimeoutError',
		message: 'Request deadline exceeded'
	});
	const signal = run.mock.calls[0][0];
	await vi.advanceTimersByTimeAsync(2999);
	expect(signal.aborted).toBe(false);
	await vi.advanceTimersByTimeAsync(1);
	await rejected;
	expect(signal.aborted).toBe(true);
	await expect(pending).rejects.toBe(signal.reason);
	expect(vi.getTimerCount()).toBe(0);
});

it('withDeadline returns a fast result and clears the timer', async () => {
	vi.useFakeTimers();
	const value = { circulatingSupply: '10' };
	await expect(withDeadline(async () => value, 3000)).resolves.toBe(value);
	expect(vi.getTimerCount()).toBe(0);
});

it('withDeadline passes through a run rejection and clears the timer', async () => {
	vi.useFakeTimers();
	const error = new Error('supply unavailable');
	await expect(withDeadline(() => Promise.reject(error), 3000)).rejects.toBe(error);
	expect(vi.getTimerCount()).toBe(0);
});
