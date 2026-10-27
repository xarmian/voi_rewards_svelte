import { afterEach, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from './fetchWithTimeout';

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
