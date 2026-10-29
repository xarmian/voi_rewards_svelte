import algosdk from 'algosdk';
import { describe, expect, it, vi } from 'vitest';
import { retryRecipients, sendGroups } from './groupSend';
import { retryable, trackPending, type TrackedOutcome } from './sendAndConfirm';

describe('group retry safety', () => {
	it('never re-sends a pending group; only rejection or tracked expiry permits retry', async () => {
		const account = algosdk.generateAccount();
		const groups = [1, 2].map((amount) => [
			algosdk
				.makePaymentTxnWithSuggestedParamsFromObject({
					from: account.addr,
					to: account.addr,
					amount,
					suggestedParams: {
						fee: 1000,
						flatFee: true,
						firstRound: 1,
						lastRound: 100,
						genesisID: 'voimain-v1.0',
						genesisHash: Buffer.alloc(32).toString('base64')
					}
				})
				.signTxn(account.sk)
		]);
		const recipientsByGroup = [
			[{ address: 'A1' }, { address: 'A2' }],
			[{ address: 'B1' }, { address: 'B2' }]
		];
		const send = vi.fn(async (group: Uint8Array[]) => {
			if (group === groups[1]) throw Object.assign(new Error('refused'), { status: 400 });
			return {};
		});
		const waitForConfirmation = vi.fn(async () => {
			throw new Error('wait timed out');
		});
		const outcomes: TrackedOutcome[] = await sendGroups(groups, { send, waitForConfirmation });
		expect(outcomes.map((o) => o.status)).toEqual(['pending', 'rejected']);
		expect(retryRecipients(outcomes, recipientsByGroup)).toEqual(recipientsByGroup[1]);
		const retryGroups = retryable(outcomes).map((index) => groups[index]);
		send.mockClear();
		await sendGroups(retryGroups, { send, waitForConfirmation });
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith(groups[1]);
		expect(send).not.toHaveBeenCalledWith(groups[0]);

		const a = outcomes[0];
		if (a.status !== 'pending') throw new Error('A must stay pending');
		outcomes[0] = await trackPending(
			a,
			{
				pendingInfo: async () => ({}),
				indexerSearch: async () => ({ 'current-round': 101, transactions: [] })
			},
			{ intervalMs: 1 }
		);
		expect(outcomes[0].status).toBe('expired');
		expect(retryRecipients(outcomes, recipientsByGroup)).toEqual(recipientsByGroup.flat());
	});
});
