import { afterEach, describe, expect, it, vi } from 'vitest';
import { indexerCaughtUpPast } from './indexerHealth';

describe('indexerCaughtUpPast', () => {
	afterEach(() => vi.useRealTimers());
	it('requires algod past lastValid and the exact block available', async () => {
		const deps = { algodRound: vi.fn(async () => 101), indexerHasBlock: vi.fn(async () => true) };
		expect(await indexerCaughtUpPast(100, deps)).toBe(true);
		expect(deps.indexerHasBlock).toHaveBeenCalledWith(100);
		await indexerCaughtUpPast(100, deps);
		expect(deps.algodRound).toHaveBeenCalledTimes(2);
		expect(deps.indexerHasBlock).toHaveBeenCalledTimes(2);
	});
	it.each([99, 100, NaN, Infinity, -Infinity])(
		'returns false for algod round %s',
		async (round) => {
			const indexerHasBlock = vi.fn(async () => true);
			expect(
				await indexerCaughtUpPast(100, { algodRound: async () => round, indexerHasBlock })
			).toBe(false);
			expect(indexerHasBlock).not.toHaveBeenCalled();
		}
	);
	it('returns false when the indexer lacks the block', async () => {
		expect(
			await indexerCaughtUpPast(100, {
				algodRound: async () => 101,
				indexerHasBlock: async () => false
			})
		).toBe(false);
	});
	it.each(['algodRound', 'indexerHasBlock'] as const)(
		'never throws when %s rejects',
		async (member) => {
			const deps = { algodRound: async () => 101, indexerHasBlock: async () => true };
			const broken = { ...deps, [member]: () => Promise.reject(new Error('offline')) };
			expect(await indexerCaughtUpPast(100, broken)).toBe(false);
		}
	);
	it('treats a malformed block proof as unknown and never consults an indexer round', async () => {
		const deps = {
			algodRound: async () => 101,
			indexerHasBlock: async () => NaN as never,
			get indexerRound(): never {
				throw new Error('must not be read');
			}
		};
		expect(await indexerCaughtUpPast(100, deps)).toBe(false);
	});
	it.each(['algodRound', 'indexerHasBlock'] as const)(
		'times out a hung %s and clears its timer',
		async (member) => {
			vi.useFakeTimers();
			const deps = {
				algodRound: async () => 101,
				indexerHasBlock: async () => true,
				[member]: () => new Promise<never>(() => {})
			};
			const result = indexerCaughtUpPast(100, deps, { timeoutMs: 25 });
			await vi.advanceTimersByTimeAsync(24);
			expect(vi.getTimerCount()).toBe(1);
			await vi.advanceTimersByTimeAsync(1);
			expect(await result).toBe(false);
			expect(vi.getTimerCount()).toBe(0);
		}
	);
	it('defaults to ten seconds and handles a late rejection after timeout', async () => {
		vi.useFakeTimers();
		const late = Promise.withResolvers<number>();
		const result = indexerCaughtUpPast(100, {
			algodRound: () => late.promise,
			indexerHasBlock: async () => true
		});
		await vi.advanceTimersByTimeAsync(10000);
		expect(await result).toBe(false);
		late.reject(new Error('late failure'));
		await vi.advanceTimersByTimeAsync(0);
		expect(vi.getTimerCount()).toBe(0);
	});
	it.each(['success', 'rejection'] as const)('clears the timeout after early %s', async (mode) => {
		vi.useFakeTimers();
		expect(
			await indexerCaughtUpPast(
				100,
				{
					algodRound: async () => {
						if (mode === 'rejection') throw new Error('offline');
						return 101;
					},
					indexerHasBlock: async () => true
				},
				{ timeoutMs: 25 }
			)
		).toBe(mode === 'success');
		expect(vi.getTimerCount()).toBe(0);
	});
});
