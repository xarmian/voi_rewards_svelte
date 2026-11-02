import { describe, expect, it, vi } from 'vitest';
import { indexerCaughtUpPast } from './indexerHealth';

describe('indexerCaughtUpPast', () => {
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
});
