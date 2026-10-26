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

describe('TASK-35 strict keyed async cache', () => {
	it.each([new Error('offline'), null, undefined])(
		'rejects on %s and preserves the stored value and timestamp',
		async (failure) => {
			const { cache, advance } = setup();
			await cache.get('X', async () => 1);
			advance(99);
			const fetcher = vi.fn(async () => {
				if (failure instanceof Error) throw failure;
				return failure;
			});
			const pending = cache.get('X', fetcher, { force: true, strict: true });
			if (failure instanceof Error) await expect(pending).rejects.toBe(failure);
			else await expect(pending).rejects.toThrow('Account not found');
			expect(await cache.get('X', fetcher)).toBe(1);
			advance(1);
			// The failure did not renew the timestamp or replace the stored value.
			expect(await cache.get('X', fetcher)).toBe(1);
			expect(fetcher).toHaveBeenCalledTimes(2);
		}
	);

	it('returns a fresh value within TTL, even during a non-strict refresh', async () => {
		const { cache, advance } = setup();
		await cache.get('X', async () => 1);
		advance(99);
		let resolve!: (value: number) => void;
		const pending = cache.get('X', () => new Promise<number>((done) => (resolve = done)), {
			force: true
		});
		const fetcher = vi.fn().mockResolvedValue(3);
		expect(await cache.get('X', fetcher, { strict: true })).toBe(1);
		expect(fetcher).not.toHaveBeenCalled();
		resolve(2);
		await pending;
	});

	it('always fetches with force and publishes the result', async () => {
		const onValue = vi.fn();
		const cache = createKeyedCache<string, number>({ ttlMs: 100, onValue });
		const fetcher = vi.fn().mockResolvedValueOnce(1).mockResolvedValue(2);
		await cache.get('X', fetcher);
		expect(await cache.get('X', fetcher, { force: true, strict: true })).toBe(2);
		expect(await cache.get('X', fetcher)).toBe(2);
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(onValue.mock.calls).toEqual([
			['X', 1],
			['X', 2]
		]);
	});

	it.each(['fails', 'succeeds'])(
		'lets an in-flight ordinary request publish when a later strict request %s',
		async (outcome) => {
			const onValue = vi.fn();
			const cache = createKeyedCache<string, number>({ ttlMs: 100, onValue });
			let resolve!: (value: number) => void;
			const ordinary = cache.get('X', () => new Promise<number>((done) => (resolve = done)));
			const error = new Error('strict failure');
			const strict = cache.get(
				'X',
				async () => {
					if (outcome === 'fails') throw error;
					return 1;
				},
				{ strict: true }
			);
			if (outcome === 'fails') await expect(strict).rejects.toBe(error);
			else expect(await strict).toBe(1);
			expect(onValue).not.toHaveBeenCalled();
			const fetcher = vi.fn().mockResolvedValue(3);
			const joined = cache.get('X', fetcher);
			resolve(2);
			expect(await ordinary).toBe(2);
			expect(await joined).toBe(2);
			expect(joined).toBe(ordinary);
			expect(await cache.get('X', fetcher)).toBe(2);
			expect(fetcher).not.toHaveBeenCalled();
			expect(onValue.mock.calls).toEqual([['X', 2]]);
		}
	);

	it('publishes a strict success into an empty cache with no ordinary request in flight', async () => {
		const onValue = vi.fn();
		const cache = createKeyedCache<string, number>({ ttlMs: 100, onValue });
		expect(await cache.get('X', async () => 1, { strict: true })).toBe(1);
		const fetcher = vi.fn().mockResolvedValue(2);
		expect(await cache.get('X', fetcher)).toBe(1);
		expect(fetcher).not.toHaveBeenCalled();
		expect(onValue.mock.calls).toEqual([['X', 1]]);
	});

	it('does not join a non-strict request whose failure substitutes a stale value', async () => {
		const { cache, advance } = setup();
		await cache.get('X', async () => 1);
		advance(100);
		let reject!: (error: Error) => void;
		const ordinary = cache.get('X', () => new Promise<number>((_, fail) => (reject = fail)));
		const error = new Error('strict failure');
		const fetcher = vi.fn().mockRejectedValue(error);
		const strict = cache.get('X', fetcher, { strict: true });
		expect(strict).not.toBe(ordinary);
		await expect(strict).rejects.toBe(error);
		expect(fetcher).toHaveBeenCalledTimes(1);
		reject(new Error('ordinary failure'));
		expect(await ordinary).toBe(1);
	});

	it('keeps non-strict readers on their own in-flight request when a strict read fails', async () => {
		const { cache, advance } = setup();
		await cache.get('X', async () => 1);
		advance(100);
		let reject!: (error: Error) => void;
		const ordinary = cache.get('X', () => new Promise<number>((_, fail) => (reject = fail)));
		const error = new Error('strict failure');
		const strict = cache.get(
			'X',
			async () => {
				throw error;
			},
			{ strict: true }
		);
		const joined = cache.get('X', async () => 3);
		const strictFailure = expect(strict).rejects.toBe(error);
		const ordinaryResult = expect(joined).resolves.toBe(1);
		await Promise.resolve();
		reject(new Error('ordinary failure'));
		await Promise.all([strictFailure, ordinaryResult]);
		expect(joined).toBe(ordinary);
	});

	it.each(['newer fetch', 'invalidation'])(
		'does not publish a strict result superseded by %s',
		async (kind) => {
			const { cache } = setup();
			let resolve!: (value: number) => void;
			const pending = cache.get('X', () => new Promise<number>((done) => (resolve = done)), {
				strict: true
			});
			await Promise.resolve();
			if (kind === 'invalidation') cache.invalidate('X');
			const fetcher = vi.fn().mockResolvedValue(2);
			await cache.get('X', fetcher, { force: true });
			resolve(1);
			expect(await pending).toBe(1);
			expect(await cache.get('X', fetcher)).toBe(2);
			expect(fetcher).toHaveBeenCalledTimes(1);
		}
	);
});

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

describe('TASK-30 r2: stale fallback never crosses an invalidation', () => {
	it.each(['null result', 'rejection'])('returns no pre-invalidation value (%s)', async (kind) => {
		const { cache, advance } = setup();
		await cache.get('X', async () => 1);
		advance(200);
		let settle!: () => void;
		const pending = cache.get(
			'X',
			() =>
				new Promise<number | null>((done, fail) => {
					settle = () => (kind === 'null result' ? done(null) : fail(new Error('down')));
				})
		);
		await Promise.resolve();
		cache.invalidate();
		settle();
		if (kind === 'null result') expect(await pending).toBeNull();
		else await expect(pending).rejects.toThrow('down');
	});
});
