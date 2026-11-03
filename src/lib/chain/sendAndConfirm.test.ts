import algosdk from 'algosdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	groupInfo,
	retryable,
	sendAndConfirm,
	trackPending,
	type PendingOutcome
} from './sendAndConfirm';
import type { TrackingDependencies } from './sendAndConfirm';
import { createTrackingDeps } from './trackingDeps';

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
	beforeEach(() => vi.useFakeTimers());
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
			indexerSearch: vi.fn(
				async (): Promise<Search> => ({ 'current-round': 90, transactions: [] })
			),
			algodRound: vi.fn(async () => 90),
			indexerHasBlock: vi.fn(async () => false)
		};
	}

	it('returns positive pendingInfo evidence while the expiry probe is still hung', async () => {
		const d = deps();
		const probe = Promise.withResolvers<number>();
		d.algodRound.mockReturnValue(probe.promise);
		d.pendingInfo.mockResolvedValue({ 'confirmed-round': 99 });
		const settled = vi.fn();
		const tracking = trackPending(pending, d).then(settled);
		await vi.advanceTimersByTimeAsync(0);
		expect(settled).toHaveBeenCalledWith({
			status: 'confirmed',
			txIds: pending.txIds,
			confirmedRound: 99
		});
		expect(d.indexerSearch).not.toHaveBeenCalled();
		probe.resolve(101);
		await tracking;
		await vi.advanceTimersByTimeAsync(0);
		expect(vi.getTimerCount()).toBe(0);
	});
	it('treats a timed out probe as false and stays pending', async () => {
		const d = deps();
		const controller = new AbortController();
		d.algodRound.mockReturnValue(new Promise(() => {}));
		const settled = vi.fn();
		const tracking = trackPending(pending, d, { intervalMs: 1000, signal: controller.signal }).then(
			settled
		);
		await vi.advanceTimersByTimeAsync(9999);
		expect(d.indexerSearch).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(d.indexerSearch).toHaveBeenCalledOnce();
		expect(settled).not.toHaveBeenCalled();
		controller.abort();
		await tracking;
		expect(settled).toHaveBeenCalledWith(pending);
		expect(vi.getTimerCount()).toBe(0);
	});
	it('keeps a send pending across timed out passes with at most one hung status request per stale window', async () => {
		const status = vi.fn(() => ({ do: () => new Promise<Record<string, unknown>>(() => {}) }));
		const pendingInfo = vi.fn(async () => ({}));
		const search = vi.fn(async () => ({ 'current-round': 200, transactions: [] }));
		const lookupBlock = vi.fn(() => ({ do: async () => ({ round: 100 }) }));
		const d = createTrackingDeps(
			{ status, pendingTransactionInformation: () => ({ do: pendingInfo }) },
			{ lookupBlock, searchForTransactions: () => ({ txid: () => ({ do: search }) }) }
		);
		const controller = new AbortController();
		const settled = vi.fn();
		const tracking = trackPending(pending, d, { intervalMs: 1000, signal: controller.signal }).then(
			settled
		);
		try {
			await vi.advanceTimersByTimeAsync(34000);
			expect(search).toHaveBeenCalledTimes(3);
			expect(pendingInfo).toHaveBeenCalledTimes(4);
			// A hung shared request is replaced once it is stale (15 s): requests start at about 0, 15
			// and 30 s, never one per pass, and the send is never expired on a hung probe.
			expect(status.mock.calls.length).toBeGreaterThanOrEqual(2);
			expect(status.mock.calls.length).toBeLessThanOrEqual(1 + Math.floor(34000 / 15000));
			expect(lookupBlock).not.toHaveBeenCalled();
			expect(settled).not.toHaveBeenCalled();
		} finally {
			controller.abort();
			await tracking;
		}
		expect(settled).toHaveBeenCalledWith(pending);
		// Let the last detached expiry race time out before restoring real timers.
		await vi.advanceTimersByTimeAsync(10000);
		expect(vi.getTimerCount()).toBe(0);
	});
	it('waits for the fresh probe to settle before searching', async () => {
		const order: string[] = [];
		const block = Promise.withResolvers<boolean>();
		const d = deps();
		d.algodRound.mockImplementation(async () => {
			order.push('algod');
			return 101;
		});
		d.pendingInfo.mockImplementation(async () => {
			order.push('pending');
			return {};
		});
		d.indexerHasBlock.mockImplementation(async () => {
			order.push('block');
			const result = await block.promise;
			order.push('probe settled');
			return result;
		});
		d.indexerSearch.mockImplementation(async () => {
			order.push('search');
			return { 'current-round': 101, transactions: [] };
		});
		const tracking = trackPending(pending, d);
		await vi.advanceTimersByTimeAsync(0);
		expect(order).toEqual(['algod', 'pending', 'block']);
		expect(d.indexerSearch).not.toHaveBeenCalled();
		block.resolve(true);
		expect(await tracking).toMatchObject({ status: 'expired' });
		expect(order).toEqual(['algod', 'pending', 'block', 'probe settled', 'search']);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('confirms on a later algod poll', async () => {
		const d = deps();
		d.pendingInfo.mockResolvedValueOnce({}).mockResolvedValue({ 'confirmed-round': 99 });
		const tracking = trackPending(pending, d, { intervalMs: 1 });
		await vi.advanceTimersByTimeAsync(2);
		expect(await tracking).toEqual({
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
		const tracking = trackPending(pending, d, { intervalMs: 1 });
		await vi.advanceTimersByTimeAsync(2);
		expect(await tracking).toEqual({
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
		const tracking = trackPending(pending, d, { intervalMs: 1 });
		await vi.advanceTimersByTimeAsync(2);
		expect(await tracking).toEqual({
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
		const tracking = trackPending(pending, d, { intervalMs: 1 });
		await vi.advanceTimersByTimeAsync(2);
		expect(await tracking).toEqual({
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
		const tracking = trackPending(pending, d, { intervalMs: 1 });
		await vi.advanceTimersByTimeAsync(2);
		expect(await tracking).toEqual({
			status: 'confirmed',
			txIds: pending.txIds,
			confirmedRound: 99
		});
	});

	it('expires only once algod is past lastValid and the indexer has the block', async () => {
		const d = deps();
		d.algodRound.mockResolvedValueOnce(99).mockResolvedValueOnce(100).mockResolvedValue(101);
		d.indexerHasBlock.mockResolvedValue(true);
		// The search response itself must report a current round at or past lastValid.
		d.indexerSearch.mockResolvedValue({ 'current-round': 100, transactions: [] });
		const settled = vi.fn();
		const tracking = trackPending(pending, d, { intervalMs: 1 }).then(settled);
		await vi.advanceTimersByTimeAsync(1);
		expect(d.indexerSearch).toHaveBeenCalledTimes(2);
		expect(settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await tracking;
		expect(settled).toHaveBeenCalledWith({ status: 'expired', txIds: pending.txIds });
	});

	async function staysPending(d: TrackingDependencies) {
		const controller = new AbortController();
		const search = vi.spyOn(d, 'indexerSearch');
		const tracking = trackPending(pending, d, { intervalMs: 1, signal: controller.signal });
		await vi.advanceTimersByTimeAsync(3);
		controller.abort();
		expect(await tracking).toEqual(pending);
		expect(search.mock.calls.length).toBeGreaterThan(1);
	}

	it('algod BELOW lastValid stays pending', async () => {
		const d = deps();
		d.algodRound.mockResolvedValue(99);
		d.indexerHasBlock.mockResolvedValue(true);
		d.indexerSearch.mockResolvedValue({ 'current-round': 110, transactions: [] });
		await staysPending(d);
	});

	it('algod equal to lastValid stays pending', async () => {
		const d = deps();
		d.algodRound.mockResolvedValue(100);
		d.indexerHasBlock.mockResolvedValue(true);
		d.indexerSearch.mockResolvedValue({ 'current-round': 110, transactions: [] });
		await staysPending(d);
	});

	it('the block lookup erroring stays pending', async () => {
		const d = deps();
		d.algodRound.mockResolvedValue(101);
		d.indexerHasBlock.mockRejectedValue(new Error('offline'));
		d.indexerSearch.mockResolvedValue({ 'current-round': 110, transactions: [] });
		await staysPending(d);
	});

	it('an algod probe rejection stays pending', async () => {
		const d = deps();
		d.algodRound.mockRejectedValue(new Error('offline'));
		d.indexerSearch.mockResolvedValue({ 'current-round': 110, transactions: [] });
		await staysPending(d);
	});

	it('the block lookup returning another round stays pending', async () => {
		const { createTrackingDeps } = await import('./trackingDeps');
		const d = createTrackingDeps(
			{
				status: () => ({ do: async () => ({ 'last-round': 101 }) }),
				pendingTransactionInformation: () => ({ do: async () => ({}) })
			},
			{
				lookupBlock: () => ({ do: async () => ({ round: pending.lastValid - 1 }) }),
				searchForTransactions: () => ({
					txid: () => ({ do: async () => ({ 'current-round': 110, transactions: [] }) })
				})
			}
		);
		await staysPending(d);
	});

	it('current-round past lastValid alone stays pending when the block is unavailable', async () => {
		const d = deps();
		d.algodRound.mockResolvedValue(101);
		d.indexerSearch.mockResolvedValue({ 'current-round': 110, transactions: [] });
		await staysPending(d);
	});

	it('the transaction found reads as confirmed even when expiry proof is available', async () => {
		const d = deps();
		d.algodRound.mockResolvedValue(101);
		d.indexerHasBlock.mockResolvedValue(true);
		d.indexerSearch.mockResolvedValue({
			'current-round': 110,
			transactions: [{ id: 'A', 'confirmed-round': 99 }]
		});
		expect(await trackPending(pending, d)).toEqual({
			status: 'confirmed',
			txIds: pending.txIds,
			confirmedRound: 99
		});
	});

	it('all three conditions met reads as expired', async () => {
		const d = deps();
		d.algodRound.mockResolvedValue(101);
		d.indexerHasBlock.mockResolvedValue(true);
		d.indexerSearch.mockResolvedValue({ 'current-round': 100, transactions: [] });
		expect(await trackPending(pending, d)).toEqual({ status: 'expired', txIds: pending.txIds });
	});

	// The block probe and the txid search are two requests to one load-balanced URL: a lagging backend
	// can return an empty search right after a caught-up one served the block. Absence therefore also
	// needs the SAME search response to report a current-round at or past lastValid (dev lead).
	it('a search current-round one below lastValid stays pending', async () => {
		const d = deps();
		d.algodRound.mockResolvedValue(pending.lastValid + 1);
		d.indexerHasBlock.mockResolvedValue(true);
		d.indexerSearch.mockResolvedValue({
			'current-round': pending.lastValid - 1,
			transactions: []
		});
		await staysPending(d);
	});

	it.each([
		['missing', { transactions: [] }],
		['a string', { 'current-round': String(100), transactions: [] }],
		['NaN', { 'current-round': Number.NaN, transactions: [] }],
		['Infinity', { 'current-round': Number.POSITIVE_INFINITY, transactions: [] }],
		['null', { 'current-round': null, transactions: [] }]
	])('a search current-round that is %s stays pending', async (_label, response) => {
		const d = deps();
		d.algodRound.mockResolvedValue(pending.lastValid + 1);
		d.indexerHasBlock.mockResolvedValue(true);
		d.indexerSearch.mockResolvedValue(response as never);
		await staysPending(d);
	});

	it.each([0, 1, 10])(
		'a search current-round of lastValid + %s reads as expired',
		async (extra) => {
			const d = deps();
			d.algodRound.mockResolvedValue(pending.lastValid + 1);
			d.indexerHasBlock.mockResolvedValue(true);
			d.indexerSearch.mockResolvedValue({
				'current-round': pending.lastValid + extra,
				transactions: []
			});
			expect(await trackPending(pending, d)).toEqual({ status: 'expired', txIds: pending.txIds });
		}
	);

	it('a lagging search that reports an older round never expires a send the probe called caught up', async () => {
		const d = deps();
		d.algodRound.mockResolvedValue(pending.lastValid + 50);
		d.indexerHasBlock.mockResolvedValue(true);
		// First passes: a lagging backend answers an empty search with an old round; later: caught up.
		d.indexerSearch
			.mockResolvedValueOnce({ 'current-round': pending.lastValid - 20, transactions: [] })
			.mockResolvedValueOnce({ 'current-round': pending.lastValid - 1, transactions: [] })
			.mockResolvedValue({ 'current-round': pending.lastValid + 1, transactions: [] });
		const tracking = trackPending(pending, d, { intervalMs: 1 });
		await vi.advanceTimersByTimeAsync(10);
		expect(await tracking).toEqual({ status: 'expired', txIds: pending.txIds });
		expect(d.indexerSearch).toHaveBeenCalledTimes(3);
	});

	it('finishes a fresh probe BEFORE the search in each pass, with pending-info read meanwhile', async () => {
		const calls: string[] = [];
		const d = deps();
		d.algodRound.mockImplementation(async () => {
			calls.push('algod');
			return 101;
		});
		d.indexerHasBlock.mockImplementation(async () => {
			calls.push('block');
			return calls.length > 4;
		});
		d.pendingInfo.mockImplementation(async () => {
			calls.push('pending');
			return {};
		});
		d.indexerSearch.mockImplementation(async () => {
			calls.push('search');
			return { 'current-round': 110, transactions: [] };
		});
		const tracking = trackPending(pending, d, { intervalMs: 1 });
		await vi.advanceTimersByTimeAsync(1);
		expect((await tracking).status).toBe('expired');
		// Positive evidence (pending info) is read while the probe runs; the search is issued only
		// after the probe (algod round, then the exact block) has finished, in every pass.
		expect(calls).toEqual([
			'algod',
			'pending',
			'block',
			'search',
			'algod',
			'pending',
			'block',
			'search'
		]);
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

// Only a 4xx on submit proves rejection; expiry requires algod and exact-block evidence.
describe('trackPending review P1s', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());
	const pending: PendingOutcome = {
		status: 'pending',
		txIds: ['A'],
		firstTxId: 'A',
		lastValid: 100
	};

	it('keeps a pool error after a successful submit pending, and not retryable', async () => {
		const controller = new AbortController();
		const pendingInfo = vi.fn(
			async (): Promise<{ 'confirmed-round'?: number; 'pool-error'?: string }> => {
				if (pendingInfo.mock.calls.length >= 3) controller.abort();
				return { 'pool-error': 'transaction dropped by this node' };
			}
		);
		const tracking = trackPending(
			pending,
			{
				pendingInfo,
				indexerSearch: async () => ({ 'current-round': 90, transactions: [] }),
				algodRound: async () => 90,
				indexerHasBlock: async () => false
			},
			{ intervalMs: 1, signal: controller.signal }
		);
		await vi.advanceTimersByTimeAsync(3);
		const outcome = await tracking;
		expect(outcome.status).toBe('pending');
		expect(retryable([outcome])).toEqual([]);
	});

	it('does not expire when the exact block is missing despite a separate reported round', async () => {
		// A separate reported round cannot prove the indexer has the exact block.
		const controller = new AbortController();
		const indexerSearch = vi.fn(async () => {
			if (indexerSearch.mock.calls.length >= 3) controller.abort();
			return { 'current-round': 99, transactions: [] };
		});
		const tracking = trackPending(
			pending,
			{
				pendingInfo: async () => ({}),
				indexerSearch,
				algodRound: async () => 110,
				indexerHasBlock: async () => false
			},
			{ intervalMs: 1, signal: controller.signal }
		);
		await vi.advanceTimersByTimeAsync(3);
		const outcome = await tracking;
		expect(outcome.status).toBe('pending');
	});

	it('expires once algod is past lastValid and the exact block is available with zero results', async () => {
		const tracking = trackPending(
			pending,
			{
				pendingInfo: async () => ({}),
				algodRound: async () => 101,
				indexerHasBlock: async () => true,
				indexerSearch: async () => ({ 'current-round': 101, transactions: [] })
			},
			{ intervalMs: 1 }
		);
		await vi.advanceTimersByTimeAsync(3);
		const outcome = await tracking;
		expect(outcome.status).toBe('expired');
	});

	it('confirms from the search response when it carries the transaction', async () => {
		const tracking = trackPending(
			pending,
			{
				pendingInfo: async () => ({}),
				algodRound: async () => 101,
				indexerHasBlock: async () => true,
				indexerSearch: async () => ({
					'current-round': 120,
					transactions: [{ id: 'A', 'confirmed-round': 98 }]
				})
			},
			{ intervalMs: 1 }
		);
		const outcome = await tracking;
		expect(outcome).toEqual({ status: 'confirmed', txIds: ['A'], confirmedRound: 98 });
	});
});
