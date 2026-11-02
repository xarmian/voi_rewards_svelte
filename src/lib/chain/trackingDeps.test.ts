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
	return { deps: createTrackingDeps(algod, indexer), algod, indexer, block, txid };
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
