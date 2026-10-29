import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLatestSearch } from './commandPalette';

function deferred() {
	let resolve!: (value: string[]) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<string[]>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('debounces rapid keystrokes into one fetch', async () => {
	const fetcher = vi.fn(async (q: string) => [q]);
	const onResult = vi.fn();
	const search = createLatestSearch(fetcher, { delay: 150, onResult });
	search.search('u');
	await vi.advanceTimersByTimeAsync(100);
	search.search('un');
	await vi.advanceTimersByTimeAsync(100);
	search.search('unit');
	await vi.advanceTimersByTimeAsync(149);
	expect(fetcher).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	expect(fetcher).toHaveBeenCalledExactlyOnceWith('unit');
	expect(onResult).toHaveBeenCalledExactlyOnceWith({ status: 'success', data: ['unit'] });
});

it('drops an older in-flight response that resolves after the latest response', async () => {
	const old = deferred();
	const latest = deferred();
	const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
	const onResult = vi.fn();
	const search = createLatestSearch(fetcher, { delay: 150, onResult });
	search.search('u');
	await vi.advanceTimersByTimeAsync(150);
	search.search('unit');
	await vi.advanceTimersByTimeAsync(150);
	latest.resolve(['UNIT']);
	await vi.advanceTimersByTimeAsync(0);
	old.resolve(['UNIT', 'aUSDC']);
	await vi.advanceTimersByTimeAsync(0);
	expect(onResult).toHaveBeenCalledExactlyOnceWith({ status: 'success', data: ['UNIT'] });
});

it('invalidates the previous response as soon as a new query is queued', async () => {
	const old = deferred();
	const onResult = vi.fn();
	const search = createLatestSearch(() => old.promise, { delay: 150, onResult });
	search.search('u');
	await vi.advanceTimersByTimeAsync(150);
	search.search('unit');
	old.resolve(['stale']);
	await vi.advanceTimersByTimeAsync(0);
	expect(onResult).not.toHaveBeenCalled();
	search.cancel();
});

it('cancel drops both an in-flight result and a queued fetch', async () => {
	const request = deferred();
	const fetcher = vi.fn(() => request.promise);
	const onResult = vi.fn();
	const search = createLatestSearch(fetcher, { delay: 150, onResult });
	search.search('u');
	await vi.advanceTimersByTimeAsync(150);
	search.search('unit');
	search.cancel();
	request.resolve(['stale']);
	await vi.runAllTimersAsync();
	expect(fetcher).toHaveBeenCalledTimes(1);
	expect(onResult).not.toHaveBeenCalled();
});

it('reports a rejected fetch only for the latest query', async () => {
	const old = deferred();
	const latest = deferred();
	const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
	const onResult = vi.fn();
	const search = createLatestSearch(fetcher, { delay: 150, onResult });
	search.search('u');
	await vi.advanceTimersByTimeAsync(150);
	search.search('unit');
	await vi.advanceTimersByTimeAsync(150);
	old.reject(new Error('stale failure'));
	await vi.advanceTimersByTimeAsync(0);
	expect(onResult).not.toHaveBeenCalled();
	const error = new Error('latest failure');
	latest.reject(error);
	await vi.advanceTimersByTimeAsync(0);
	expect(onResult).toHaveBeenCalledExactlyOnceWith({ status: 'error', error });
});
