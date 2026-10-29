import algosdk from 'algosdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupInfo, sendAndConfirm, trackPending, type PendingOutcome } from './sendAndConfirm';

function signedGroup() {
	const account = algosdk.generateAccount();
	const txns = [100, 95].map((lastRound, i) =>
		algosdk.makePaymentTxnWithSuggestedParamsFromObject({
			from: account.addr,
			to: account.addr,
			amount: i + 1,
			suggestedParams: {
				fee: 1000,
				flatFee: true,
				firstRound: 1,
				lastRound,
				genesisID: 'voimain-v1.0',
				genesisHash: Buffer.alloc(32).toString('base64')
			}
		})
	);
	algosdk.assignGroupID(txns);
	return {
		signed: txns.map((txn) => txn.signTxn(account.sk)),
		txIds: txns.map((txn) => txn.txID())
	};
}

describe('sendAndConfirm', () => {
	it('decodes every txid and the earliest last-valid round before sending', async () => {
		const { signed, txIds } = signedGroup();
		expect(groupInfo(signed)).toEqual({ txIds, firstTxId: txIds[0], lastValid: 95 });
		const send = vi.fn(async () => ({}));
		const waitForConfirmation = vi.fn(async () => ({ 'confirmed-round': 10 }));
		expect(await sendAndConfirm(signed, { send, waitForConfirmation })).toEqual({
			status: 'confirmed',
			txIds,
			confirmedRound: 10
		});
		expect(send).toHaveBeenCalledWith(signed);
		expect(waitForConfirmation).toHaveBeenCalledWith(txIds[0]);
	});

	it('keeps a successful send pending when the confirmation wait throws', async () => {
		const { signed, txIds } = signedGroup();
		expect(
			await sendAndConfirm(signed, {
				send: async () => ({}),
				waitForConfirmation: async () => {
					throw new Error('wait timed out');
				}
			})
		).toEqual({ status: 'pending', txIds, firstTxId: txIds[0], lastValid: 95 });
	});

	it.each([
		[Object.assign(new Error('refused'), { status: 400 }), 'rejected'],
		[new Error('network disconnected'), 'pending'],
		[Object.assign(new Error('server error'), { status: 500 }), 'pending']
	])('classifies a send error: %s as %s', async (error, status) => {
		const { signed, txIds } = signedGroup();
		const waitForConfirmation = vi.fn();
		const result = await sendAndConfirm(signed, {
			send: async () => {
				throw error;
			},
			waitForConfirmation
		});
		expect(result).toEqual(
			status === 'rejected'
				? { status, txIds, error: error.message }
				: { status, txIds, firstTxId: txIds[0], lastValid: 95 }
		);
		expect(waitForConfirmation).not.toHaveBeenCalled();
	});

	it('keeps a wait without a confirmed round pending', async () => {
		const { signed } = signedGroup();
		expect(
			await sendAndConfirm(signed, {
				send: async () => ({}),
				waitForConfirmation: async () => ({})
			})
		).toMatchObject({ status: 'pending' });
	});
});

describe('trackPending', () => {
	afterEach(() => vi.useRealTimers());
	const pending: PendingOutcome = {
		status: 'pending',
		txIds: ['A', 'B'],
		firstTxId: 'A',
		lastValid: 100
	};
	function deps() {
		return {
			pendingInfo: vi.fn(
				async (): Promise<{ 'confirmed-round'?: number; 'pool-error'?: string }> => ({})
			),
			indexerLookup: vi.fn(async (): Promise<{ transaction?: { 'confirmed-round'?: number } }> => {
				throw Object.assign(new Error('not found'), { status: 404 });
			}),
			currentRound: vi.fn(async () => 90),
			indexerRound: vi.fn(async () => 90)
		};
	}

	it('confirms on a later algod poll', async () => {
		const d = deps();
		d.pendingInfo.mockResolvedValueOnce({}).mockResolvedValue({ 'confirmed-round': 99 });
		expect(await trackPending(pending, d, { intervalMs: 1 })).toEqual({
			status: 'confirmed',
			txIds: pending.txIds,
			confirmedRound: 99
		});
		expect(d.pendingInfo).toHaveBeenCalledTimes(2);
	});

	it('confirms through the indexer when algod returns 404', async () => {
		const d = deps();
		d.pendingInfo.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
		d.indexerLookup.mockResolvedValue({ transaction: { 'confirmed-round': 99 } });
		expect(await trackPending(pending, d, { intervalMs: 1 })).toEqual({
			status: 'confirmed',
			txIds: pending.txIds,
			confirmedRound: 99
		});
		expect(d.indexerLookup).toHaveBeenCalledWith('A');
	});

	it('reports an explicit pool error as rejected', async () => {
		const d = deps();
		d.pendingInfo.mockResolvedValue({ 'pool-error': 'overspend' });
		expect(await trackPending(pending, d, { intervalMs: 1 })).toEqual({
			status: 'rejected',
			txIds: pending.txIds,
			error: 'overspend'
		});
	});

	it('keeps polling through lookup and round errors', async () => {
		const d = deps();
		d.pendingInfo
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue({ 'confirmed-round': 99 });
		d.currentRound.mockRejectedValue(new Error('offline'));
		d.indexerRound.mockRejectedValue(new Error('offline'));
		d.indexerLookup.mockRejectedValue(Object.assign(new Error('unavailable'), { status: 500 }));
		expect(await trackPending(pending, d, { intervalMs: 1 })).toEqual({
			status: 'confirmed',
			txIds: pending.txIds,
			confirmedRound: 99
		});
	});

	it('prefers an indexed confirmation over expiry even after both rounds pass lastValid', async () => {
		const d = deps();
		d.currentRound.mockResolvedValue(110);
		d.indexerRound.mockResolvedValue(110);
		d.indexerLookup.mockResolvedValue({ transaction: { 'confirmed-round': 100 } });
		expect(await trackPending(pending, d, { intervalMs: 1 })).toEqual({
			status: 'confirmed',
			txIds: pending.txIds,
			confirmedRound: 100
		});
	});

	it('does not treat a transient indexer error as proof of expiry', async () => {
		const d = deps();
		d.currentRound.mockResolvedValue(110);
		d.indexerRound.mockResolvedValue(110);
		d.indexerLookup
			.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }))
			.mockResolvedValue({ transaction: { 'confirmed-round': 99 } });
		expect(await trackPending(pending, d, { intervalMs: 1 })).toEqual({
			status: 'confirmed',
			txIds: pending.txIds,
			confirmedRound: 99
		});
	});

	it('waits for the indexer to pass lastValid before expiring', async () => {
		vi.useFakeTimers();
		const d = deps();
		d.currentRound.mockResolvedValue(110);
		d.indexerRound.mockResolvedValueOnce(99).mockResolvedValueOnce(100).mockResolvedValue(101);
		const settled = vi.fn();
		const tracking = trackPending(pending, d, { intervalMs: 1 }).then(settled);
		await vi.advanceTimersByTimeAsync(1);
		expect(d.pendingInfo).toHaveBeenCalledTimes(2);
		expect(settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await tracking;
		expect(settled).toHaveBeenCalledWith({ status: 'expired', txIds: pending.txIds });
	});

	it('expires only after both rounds pass lastValid and a fresh indexer lookup lacks the txid', async () => {
		const d = deps();
		d.currentRound.mockResolvedValue(101);
		d.indexerRound.mockResolvedValue(101);
		d.indexerLookup.mockImplementation(async () => {
			expect(d.indexerRound).toHaveBeenCalled();
			throw Object.assign(new Error('not found'), { status: 404 });
		});
		expect(await trackPending(pending, d, { intervalMs: 1 })).toEqual({
			status: 'expired',
			txIds: pending.txIds
		});
	});

	it('aborts during polling and makes no further requests', async () => {
		vi.useFakeTimers();
		const d = deps();
		const controller = new AbortController();
		const tracking = trackPending(pending, d, { intervalMs: 1, signal: controller.signal });
		await vi.advanceTimersByTimeAsync(2);
		controller.abort();
		expect(await tracking).toEqual(pending);
		const polls = d.pendingInfo.mock.calls.length;
		await vi.advanceTimersByTimeAsync(20);
		expect(d.pendingInfo).toHaveBeenCalledTimes(polls);
	});

	it('resolves on abort even while a request is still in flight', async () => {
		const d = deps();
		d.pendingInfo.mockImplementation(() => new Promise(() => {}));
		const controller = new AbortController();
		const tracking = trackPending(pending, d, { intervalMs: 1, signal: controller.signal });
		controller.abort();
		expect(await tracking).toEqual(pending);
		expect(d.indexerLookup).not.toHaveBeenCalled();
	});

	it('does not poll an already aborted signal', async () => {
		const d = deps();
		const controller = new AbortController();
		controller.abort();
		expect(await trackPending(pending, d, { signal: controller.signal })).toEqual(pending);
		expect(d.pendingInfo).not.toHaveBeenCalled();
	});
});
