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
	it('shares a pending fetch, including forced callers', async () => {
		const { cache } = setup();
		let resolve!: (value: number) => void;
		const fetcher = vi.fn(() => new Promise<number>((done) => (resolve = done)));
		const first = cache.get('X', fetcher);
		const second = cache.get('X', fetcher, { force: true });
		await Promise.resolve();
		expect(fetcher).toHaveBeenCalledTimes(1);
		resolve(42);
		expect(await Promise.all([first, second])).toEqual([42, 42]);
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
		await cache.get('X', fetcher);
		await cache.get('X', fetcher);
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
