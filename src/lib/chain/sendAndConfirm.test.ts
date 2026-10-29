import algosdk from 'algosdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	groupInfo,
	retryable,
	sendAndConfirm,
	trackPending,
	type PendingOutcome
} from './sendAndConfirm';

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
	type Search = {
		'current-round': number;
		transactions: { id?: string; 'confirmed-round'?: number }[];
	};
	function deps() {
		return {
			pendingInfo: vi.fn(
				async (): Promise<{ 'confirmed-round'?: number; 'pool-error'?: string }> => ({})
			),
			indexerSearch: vi.fn(async (): Promise<Search> => ({ 'current-round': 90, transactions: [] }))
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

	it('confirms through the indexer search when algod returns 404', async () => {
		const d = deps();
		d.pendingInfo.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
		d.indexerSearch.mockResolvedValue({
			'current-round': 99,
			transactions: [{ id: 'A', 'confirmed-round': 99 }]
		});
		expect(await trackPending(pending, d, { intervalMs: 1 })).toEqual({
			status: 'confirmed',
			txIds: pending.txIds,
			confirmedRound: 99
		});
		expect(d.indexerSearch).toHaveBeenCalledWith('A');
	});

	it('keeps polling through algod and search errors', async () => {
		const d = deps();
		d.pendingInfo
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue({ 'confirmed-round': 99 });
		d.indexerSearch.mockRejectedValue(Object.assign(new Error('unavailable'), { status: 500 }));
		expect(await trackPending(pending, d, { intervalMs: 1 })).toEqual({
			status: 'confirmed',
			txIds: pending.txIds,
			confirmedRound: 99
		});
	});

	it('prefers a found transaction over expiry even when the response is past lastValid', async () => {
		const d = deps();
		d.indexerSearch.mockResolvedValue({
			'current-round': 110,
			transactions: [{ id: 'A', 'confirmed-round': 100 }]
		});
		expect(await trackPending(pending, d, { intervalMs: 1 })).toEqual({
			status: 'confirmed',
			txIds: pending.txIds,
			confirmedRound: 100
		});
	});

	it('does not treat a transient search error as proof of expiry', async () => {
		const d = deps();
		d.indexerSearch
			.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }))
			.mockResolvedValue({
				'current-round': 110,
				transactions: [{ id: 'A', 'confirmed-round': 99 }]
			});
		expect(await trackPending(pending, d, { intervalMs: 1 })).toEqual({
			status: 'confirmed',
			txIds: pending.txIds,
			confirmedRound: 99
		});
	});

	it('waits for the answering reader to pass lastValid before expiring', async () => {
		vi.useFakeTimers();
		const d = deps();
		d.indexerSearch
			.mockResolvedValueOnce({ 'current-round': 99, transactions: [] })
			.mockResolvedValueOnce({ 'current-round': 100, transactions: [] })
			.mockResolvedValue({ 'current-round': 101, transactions: [] });
		const settled = vi.fn();
		const tracking = trackPending(pending, d, { intervalMs: 1 }).then(settled);
		await vi.advanceTimersByTimeAsync(1);
		expect(d.indexerSearch).toHaveBeenCalledTimes(2);
		expect(settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await tracking;
		expect(settled).toHaveBeenCalledWith({ status: 'expired', txIds: pending.txIds });
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
		expect(d.indexerSearch).not.toHaveBeenCalled();
	});

	it('does not poll an already aborted signal', async () => {
		const d = deps();
		const controller = new AbortController();
		controller.abort();
		expect(await trackPending(pending, d, { signal: controller.signal })).toEqual(pending);
		expect(d.pendingInfo).not.toHaveBeenCalled();
	});
});

// TASK-81 review P1s (#70): only a 4xx on submit proves a transaction can never land, and absence
// is proven only by a round taken from the same indexer response that lacked the txid.
describe('trackPending review P1s', () => {
	const pending: PendingOutcome = {
		status: 'pending',
		txIds: ['A'],
		firstTxId: 'A',
		lastValid: 100
	};
	const notFound = () => Promise.reject(Object.assign(new Error('not found'), { status: 404 }));

	it('keeps a pool error after a successful submit pending, and not retryable', async () => {
		const controller = new AbortController();
		const pendingInfo = vi.fn(async () => {
			if (pendingInfo.mock.calls.length >= 3) controller.abort();
			return { 'pool-error': 'transaction dropped by this node' };
		});
		const outcome = await trackPending(
			pending,
			{
				pendingInfo,
				indexerSearch: async () => ({ 'current-round': 90, transactions: [] }),
				indexerLookup: notFound,
				currentRound: async () => 90,
				indexerRound: async () => 90
			} as never,
			{ intervalMs: 1, signal: controller.signal }
		);
		expect(outcome.status).toBe('pending');
		expect(retryable([outcome])).toEqual([]);
	});

	it('does not expire when the response lacking the txid is itself behind lastValid', async () => {
		// A load-balanced lagging reader 404s the txid while a separate health call says caught up.
		const controller = new AbortController();
		const indexerSearch = vi.fn(async () => {
			if (indexerSearch.mock.calls.length >= 3) controller.abort();
			return { 'current-round': 99, transactions: [] };
		});
		const outcome = await trackPending(
			pending,
			{
				pendingInfo: async () => ({}),
				indexerSearch,
				indexerLookup: notFound,
				currentRound: async () => 110,
				indexerRound: async () => 110
			} as never,
			{ intervalMs: 1, signal: controller.signal }
		);
		expect(outcome.status).toBe('pending');
	});

	it('expires once the same response is past lastValid with zero results', async () => {
		const outcome = await trackPending(
			pending,
			{
				pendingInfo: async () => ({}),
				indexerSearch: async () => ({ 'current-round': 101, transactions: [] })
			} as never,
			{ intervalMs: 1 }
		);
		expect(outcome.status).toBe('expired');
	});

	it('confirms from the search response when it carries the transaction', async () => {
		const outcome = await trackPending(
			pending,
			{
				pendingInfo: async () => ({}),
				indexerSearch: async () => ({
					'current-round': 120,
					transactions: [{ id: 'A', 'confirmed-round': 98 }]
				})
			} as never,
			{ intervalMs: 1 }
		);
		expect(outcome).toEqual({ status: 'confirmed', txIds: ['A'], confirmedRound: 98 });
	});
});
