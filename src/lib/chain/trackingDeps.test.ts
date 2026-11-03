import { describe, expect, it, vi } from 'vitest';
import { createTrackingDeps } from './trackingDeps';

function clients() {
	const status = vi.fn(async () => ({ 'last-round': 101 }));
	const pendingInfo = vi.fn(async () => ({ 'confirmed-round': 99 }));
	const search = vi.fn(async () => ({ 'current-round': 110, transactions: [{ id: 'A' }] }));
	const block = vi.fn(async (): Promise<unknown> => ({ round: 100 }));
	const txid = vi.fn(() => ({ do: search }));
	const algod = {
		status: () => ({ do: status }),
		pendingTransactionInformation: vi.fn(() => ({ do: pendingInfo }))
	};
	const indexer = {
		searchForTransactions: () => ({ txid }),
		lookupBlock: vi.fn(() => ({ do: block }))
	};
	return { deps: createTrackingDeps(algod, indexer), algod, indexer, status, block, txid };
}

describe('createTrackingDeps', () => {
	it('reads last-round and passes through pendingInfo and indexerSearch', async () => {
		const { deps, algod, txid } = clients();
		expect(await deps.algodRound()).toBe(101);
		expect(await deps.pendingInfo('A')).toEqual({ 'confirmed-round': 99 });
		expect(algod.pendingTransactionInformation).toHaveBeenCalledWith('A');
		expect(await deps.indexerSearch('A')).toEqual({
			'current-round': 110,
			transactions: [{ id: 'A' }]
		});
		expect(txid).toHaveBeenCalledWith('A');
	});
	it('proves only the requested block number', async () => {
		const { deps, indexer } = clients();
		expect(await deps.indexerHasBlock(100)).toBe(true);
		expect(indexer.lookupBlock).toHaveBeenCalledWith(100);
	});
	it.each([{ round: 99 }, { round: 101 }, {}, { round: '100' }, { round: NaN }, null, undefined])(
		'rejects a resolved response without the exact round: %s',
		async (response) => {
			const { deps, block } = clients();
			block.mockResolvedValue(response);
			expect(await deps.indexerHasBlock(100)).toBe(false);
		}
	);
	it('returns false on numeric HTTP 404', async () => {
		const { deps, block } = clients();
		block.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
		expect(await deps.indexerHasBlock(100)).toBe(false);
	});
	it.each([new Error('offline'), { status: 503 }, { status: '404' }])(
		'rethrows other errors %s',
		async (error) => {
			const { deps, block } = clients();
			block.mockRejectedValue(error);
			await expect(deps.indexerHasBlock(100)).rejects.toBe(error);
		}
	);
});

describe('tracking probe single-flight', () => {
	it('shares the same algod promise until it settles, then reads fresh status', async () => {
		const { deps, status } = clients();
		const request = Promise.withResolvers<{ 'last-round': number }>();
		status.mockReturnValueOnce(request.promise);
		const first = deps.algodRound();
		const second = deps.algodRound();
		expect(second).toBe(first);
		expect(status).toHaveBeenCalledOnce();
		request.resolve({ 'last-round': 105 });
		expect(await Promise.all([first, second])).toEqual([105, 105]);
		expect(await deps.algodRound()).toBe(101);
		expect(status).toHaveBeenCalledTimes(2);
	});
	it('shares block lookups by round and clears resolved requests', async () => {
		const { deps, indexer, block } = clients();
		const request = Promise.withResolvers<unknown>();
		block.mockReturnValueOnce(request.promise).mockResolvedValueOnce({ round: 101 });
		const first = deps.indexerHasBlock(100);
		const second = deps.indexerHasBlock(100);
		const other = deps.indexerHasBlock(101);
		expect(second).toBe(first);
		expect(other).not.toBe(first);
		expect(indexer.lookupBlock.mock.calls).toEqual([[100], [101]]);
		request.resolve({ round: 100 });
		expect(await Promise.all([first, second, other])).toEqual([true, true, true]);
		expect(await deps.indexerHasBlock(100)).toBe(true);
		expect(indexer.lookupBlock).toHaveBeenCalledTimes(3);
	});
	it.each(['algod', 'indexer'] as const)(
		'clears a rejected shared %s request for retry',
		async (kind) => {
			const { deps, status, block } = clients();
			const request = Promise.withResolvers<{ 'last-round': number }>();
			const underlying = kind === 'algod' ? status : block;
			underlying.mockReturnValueOnce(request.promise);
			const lookup = () => (kind === 'algod' ? deps.algodRound() : deps.indexerHasBlock(100));
			const first = lookup();
			const second = lookup();
			const settled = Promise.allSettled([first, second]);
			const error = new Error('offline');
			request.reject(error);
			expect(await settled).toEqual([
				{ status: 'rejected', reason: error },
				{ status: 'rejected', reason: error }
			]);
			expect(underlying).toHaveBeenCalledOnce();
			await lookup();
			expect(underlying).toHaveBeenCalledTimes(2);
		}
	);
	it('keeps only one request for a block that never settles', () => {
		const { deps, indexer, block } = clients();
		block.mockReturnValue(new Promise(() => {}));
		const first = deps.indexerHasBlock(100);
		for (let i = 0; i < 10; i++) expect(deps.indexerHasBlock(100)).toBe(first);
		expect(indexer.lookupBlock).toHaveBeenCalledOnce();
	});
});
