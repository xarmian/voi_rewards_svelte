import { describe, expect, it, vi } from 'vitest';
import { createKeyedCache } from './asyncCache';

function setup() {
	let time = 0;
	const cache = createKeyedCache<string, number | null | undefined>({
		ttlMs: 100,
		now: () => time
	});
	return { cache, advance: (ms: number) => (time += ms) };
}

describe('TASK-30 keyed async cache', () => {
	it('shares a pending fetch between non-forced callers', async () => {
		const { cache } = setup();
		let resolve!: (value: number) => void;
		const fetcher = vi.fn(() => new Promise<number>((done) => (resolve = done)));
		const first = cache.get('X', fetcher);
		const second = cache.get('X', fetcher);
		await Promise.resolve();
		expect(fetcher).toHaveBeenCalledTimes(1);
		resolve(42);
		expect(await Promise.all([first, second])).toEqual([42, 42]);
	});

	it.each(['older first', 'newer first'])(
		'TASK-30 forced requests start a new fetch and only the newest is cached (%s)',
		async (order) => {
			const { cache } = setup();
			let resolveOld!: (value: number) => void;
			let resolveNew!: (value: number) => void;
			const older = new Promise<number>((done) => (resolveOld = done));
			const newer = new Promise<number>((done) => (resolveNew = done));
			const fetcher = vi.fn().mockReturnValueOnce(older).mockReturnValue(newer);
			const first = cache.get('X', fetcher);
			const forced = cache.get('X', fetcher, { force: true });
			const joined = cache.get('X', fetcher);
			if (order === 'older first') {
				resolveOld(1);
				await first;
				// TASK-30: settling the older request must not clear the newest pending request.
				expect(cache.get('X', fetcher)).toBe(forced);
				resolveNew(2);
			} else {
				resolveNew(2);
				// TASK-30: release both promises even on the old implementation, which joins older.
				await newer;
				await Promise.resolve();
				resolveOld(1);
			}
			expect(await Promise.all([first, forced, joined])).toEqual([1, 2, 2]);
			expect(await cache.get('X', fetcher)).toBe(2);
			expect(fetcher).toHaveBeenCalledTimes(2);
		}
	);

	it('TASK-30 non-forced callers join a refresh even while the previous value is fresh', async () => {
		const { cache } = setup();
		await cache.get('X', async () => 1);
		let resolve!: (value: number) => void;
		const fetcher = vi.fn(() => new Promise<number>((done) => (resolve = done)));
		const forced = cache.get('X', fetcher, { force: true });
		const joined = cache.get('X', fetcher);
		await Promise.resolve();
		resolve(2);
		expect(await Promise.all([forced, joined])).toEqual([2, 2]);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	describe.each([false, true])('TASK-30 stale-on-error (force=%s)', (force) => {
		it.each([null, undefined, new Error('offline')])(
			'returns the previous value after %s and retries',
			async (failure) => {
				const { cache, advance } = setup();
				await cache.get('X', async () => 0);
				advance(100);
				const fetcher = vi.fn(async () => {
					if (failure instanceof Error) throw failure;
					return failure;
				});
				expect(await cache.get('X', fetcher, { force })).toBe(0);
				// TASK-30: a failure preserves the old timestamp, so the next ordinary call retries.
				expect(await cache.get('X', fetcher)).toBe(0);
				expect(fetcher).toHaveBeenCalledTimes(2);
			}
		);
	});

	it('uses fresh values, expires at the TTL, and supports force', async () => {
		const { cache, advance } = setup();
		const fetcher = vi.fn().mockResolvedValue(1);
		await cache.get('X', fetcher);
		advance(99);
		await cache.get('X', fetcher);
		expect(fetcher).toHaveBeenCalledTimes(1);
		advance(1);
		await cache.get('X', fetcher);
		await cache.get('X', fetcher, { force: true });
		expect(fetcher).toHaveBeenCalledTimes(3);
	});

	it('clears rejected requests so the next call retries', async () => {
		const { cache } = setup();
		const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(2);
		await expect(cache.get('X', fetcher)).rejects.toThrow('offline');
		expect(await cache.get('X', fetcher)).toBe(2);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it.each([null, undefined])('does not cache %s', async (value) => {
		const { cache } = setup();
		const fetcher = vi.fn().mockResolvedValue(value);
		expect(await cache.get('X', fetcher)).toBe(value);
		expect(await cache.get('X', fetcher)).toBe(value);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('invalidates one key or every key', async () => {
		const { cache } = setup();
		const fetcher = vi.fn().mockResolvedValue(1);
		await cache.get('X', fetcher);
		await cache.get('Y', fetcher);
		cache.invalidate('X');
		await cache.get('Y', fetcher);
		await cache.get('X', fetcher);
		expect(fetcher).toHaveBeenCalledTimes(3);
		cache.invalidate();
		await cache.get('X', fetcher);
		await cache.get('Y', fetcher);
		expect(fetcher).toHaveBeenCalledTimes(5);
	});

	it.each(['key', 'all'])('does not resurrect an invalidated pending value (%s)', async (scope) => {
		const { cache } = setup();
		let resolve!: (value: number) => void;
		const old = cache.get('X', () => new Promise<number>((done) => (resolve = done)));
		await Promise.resolve();
		if (scope === 'key') cache.invalidate('X');
		else cache.invalidate();
		const fresh = vi.fn().mockResolvedValue(2);
		expect(await cache.get('X', fresh)).toBe(2);
		resolve(1);
		expect(await old).toBe(1);
		expect(await cache.get('X', fresh)).toBe(2);
		expect(fresh).toHaveBeenCalledTimes(1);
	});
});
