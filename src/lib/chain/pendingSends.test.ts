import algosdk from 'algosdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryRecipients, sendGroups } from './groupSend';
import { retryable, type Outcome, type TrackingDependencies } from './sendAndConfirm';
import {
	addPending,
	createOutcomeHandler,
	createPendingTracker,
	loadPending,
	removePending,
	type PendingSendRecord
} from './pendingSends';

function fakeStorage() {
	const data = new Map<string, string>();
	return {
		getItem: vi.fn((key: string) => data.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			data.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			data.delete(key);
		})
	};
}

const key = (wallet = 'sender') => `voirewards:pending-sends:${wallet}`;
const record = (overrides: Partial<PendingSendRecord> = {}): PendingSendRecord => ({
	kind: 'send',
	wallet: 'sender',
	txIds: ['tx-a', 'tx-b'],
	firstTxId: 'tx-a',
	lastValid: 100,
	recipients: [{ address: 'destination', amount: '1.25' }],
	symbol: 'VOI',
	createdAt: 123,
	...overrides
});

describe('pending send storage', () => {
	it('round-trips send and bridge records', () => {
		const storage = fakeStorage();
		const records = [record(), record({ kind: 'bridge', firstTxId: 'bridge', txIds: ['bridge'] })];
		for (const entry of records) addPending(entry, storage);
		expect(loadPending('sender', storage)).toEqual(records);
	});

	it.each(['{bad json', '{}', 'null'])('returns [] for %s', (saved) => {
		const storage = fakeStorage();
		storage.setItem(key(), saved);
		expect(loadPending('sender', storage)).toEqual([]);
	});

	it('handles throwing reads, writes, removals and localStorage access', () => {
		const storage = fakeStorage();
		storage.getItem.mockImplementation(() => {
			throw new Error('blocked');
		});
		expect(loadPending('sender', storage)).toEqual([]);
		storage.setItem.mockImplementation(() => {
			throw new Error('full');
		});
		storage.removeItem.mockImplementation(() => {
			throw new Error('blocked');
		});
		expect(() => addPending(record(), storage)).not.toThrow();
		expect(() => removePending('sender', 'tx-a', storage)).not.toThrow();
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('blocked');
			}
		});
		try {
			expect(loadPending('sender')).toEqual([]);
			expect(() => addPending(record())).not.toThrow();
			expect(() => removePending('sender', 'tx-a')).not.toThrow();
		} finally {
			if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
			else Reflect.deleteProperty(globalThis, 'localStorage');
		}
	});

	it.each([
		null,
		{},
		record({ kind: 'wrong' as 'send' }),
		record({ wallet: 'other' }),
		record({ txIds: [] }),
		record({ txIds: [42 as unknown as string] }),
		record({ firstTxId: 42 as unknown as string }),
		record({ lastValid: Infinity }),
		record({ recipients: [{ address: 'recipient', amount: 1 as unknown as string }] }),
		record({ symbol: null as unknown as string }),
		record({ createdAt: NaN })
	])('drops only the malformed element %#', (invalid) => {
		const storage = fakeStorage();
		const valid = [record(), record({ firstTxId: 'second', txIds: ['second'] })];
		storage.setItem(key(), JSON.stringify([valid[0], invalid, valid[1]]));
		expect(loadPending('sender', storage)).toEqual(valid);
	});

	it('isolates wallets', () => {
		const storage = fakeStorage();
		addPending(record(), storage);
		addPending(record({ wallet: 'other' }), storage);
		removePending('sender', 'tx-a', storage);
		expect(loadPending('sender', storage)).toEqual([]);
		expect(loadPending('other', storage)).toEqual([record({ wallet: 'other' })]);
	});

	it('dedupes by firstTxId and removes the key after the last removal', () => {
		const storage = fakeStorage();
		addPending(record(), storage);
		addPending(record(), storage);
		addPending(record({ firstTxId: 'second', txIds: ['second'] }), storage);
		expect(loadPending('sender', storage)).toHaveLength(2);
		removePending('sender', 'second', storage);
		expect(loadPending('sender', storage)).toEqual([record()]);
		removePending('sender', 'tx-a', storage);
		expect(storage.getItem(key())).toBeNull();
	});
});

describe('pending send tracker', () => {
	let storage: ReturnType<typeof fakeStorage>;
	let deps: TrackingDependencies;
	const trackers: ReturnType<typeof createPendingTracker>[] = [];
	function tracker(onChange = vi.fn()) {
		const result = createPendingTracker({
			wallet: 'sender',
			storage,
			deps,
			intervalMs: 1,
			onChange
		});
		trackers.push(result);
		return result;
	}
	beforeEach(() => {
		vi.useFakeTimers();
		storage = fakeStorage();
		deps = {
			pendingInfo: vi.fn(async () => ({})),
			indexerSearch: vi.fn(async () => ({ 'current-round': 50, transactions: [] }))
		};
	});
	afterEach(() => {
		for (const active of trackers.splice(0)) active.stop();
		vi.useRealTimers();
	});

	it.each(['confirmed', 'expired'] as const)(
		'persists first, then retains a final %s entry in memory',
		async (status) => {
			deps.pendingInfo = vi.fn(async () => {
				expect(loadPending('sender', storage)).toEqual([record()]);
				return status === 'confirmed' ? { 'confirmed-round': 80 } : {};
			});
			if (status === 'expired')
				deps.indexerSearch = async () => ({ 'current-round': 101, transactions: [] });
			const onChange = vi.fn();
			const active = tracker(onChange);
			expect((await active.add(record())).status).toBe(status);
			expect(storage.getItem(key())).toBeNull();
			expect(active.entries()).toEqual([
				{ record: record(), status, ...(status === 'confirmed' ? { confirmedRound: 80 } : {}) }
			]);
			expect(onChange).toHaveBeenLastCalledWith(active.entries());
			expect(onChange).toHaveBeenCalledTimes(2);
		}
	);

	it('close and reopen preserves the record, stops polling, and resumes on a new tracker', async () => {
		const first = tracker();
		const pending = first.add(record());
		await vi.advanceTimersByTimeAsync(3);
		first.stop();
		const pendingOutcome = await pending;
		expect(pendingOutcome.status).toBe('pending');
		expect(retryable([pendingOutcome])).toEqual([]);
		expect(loadPending('sender', storage)).toEqual([record()]);
		const polls = vi.mocked(deps.pendingInfo).mock.calls.length;
		await vi.advanceTimersByTimeAsync(10);
		expect(deps.pendingInfo).toHaveBeenCalledTimes(polls);
		const reopened = tracker();
		reopened.resume();
		await vi.advanceTimersByTimeAsync(2);
		expect(vi.mocked(deps.pendingInfo).mock.calls.length).toBeGreaterThan(polls);
		expect(reopened.entries()).toEqual([{ record: record(), status: 'pending' }]);
		vi.mocked(deps.pendingInfo).mockResolvedValue({ 'confirmed-round': 90 });
		await vi.advanceTimersByTimeAsync(1);
		expect(reopened.entries()[0].status).toBe('confirmed');
		expect(loadPending('sender', storage)).toEqual([]);
	});

	it('add on a stopped tracker persists without polling', async () => {
		const active = tracker();
		active.stop();
		expect((await active.add(record())).status).toBe('pending');
		await vi.advanceTimersByTimeAsync(3);
		expect(loadPending('sender', storage)).toEqual([record()]);
		expect(deps.pendingInfo).not.toHaveBeenCalled();
	});

	it('resume twice and duplicate add never start duplicate polls', async () => {
		addPending(record(), storage);
		const onChange = vi.fn();
		const active = tracker(onChange);
		active.resume();
		active.resume();
		void active.add(record());
		await vi.advanceTimersByTimeAsync(0);
		expect(deps.pendingInfo).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledTimes(3);
		await vi.advanceTimersByTimeAsync(1);
		expect(deps.pendingInfo).toHaveBeenCalledTimes(2);
	});

	it('resumes the same tracker immediately after stop without a stale poll overwriting it', async () => {
		const active = tracker();
		const old = active.add(record());
		active.stop();
		active.resume();
		vi.mocked(deps.pendingInfo).mockResolvedValue({ 'confirmed-round': 91 });
		await old;
		await vi.advanceTimersByTimeAsync(1);
		expect(active.entries()[0].status).toBe('confirmed');
	});

	it('tracks entries independently and exposes snapshots', async () => {
		const active = tracker();
		const first = active.add(record());
		void active.add(record({ firstTxId: 'second', txIds: ['second'] }));
		vi.mocked(deps.pendingInfo).mockImplementation(async (id) =>
			id === 'tx-a' ? { 'confirmed-round': 90 } : {}
		);
		await vi.advanceTimersByTimeAsync(2);
		await first;
		expect(active.entries().map((entry) => entry.status)).toEqual(['confirmed', 'pending']);
		const snapshot = active.entries();
		snapshot.pop();
		snapshot[0].status = 'expired';
		expect(active.entries().map((entry) => entry.status)).toEqual(['confirmed', 'pending']);
	});

	it('persists a pending outcome before checking an already-aborted send signal', async () => {
		const active = tracker();
		active.stop();
		const controller = new AbortController();
		controller.abort();
		const onOutcome = vi.fn();
		const handler = createOutcomeHandler({
			tracker: active,
			record: () => record(),
			signal: controller.signal,
			onOutcome
		});
		handler({ status: 'pending', txIds: ['tx-a', 'tx-b'], firstTxId: 'tx-a', lastValid: 100 }, 0);
		expect(loadPending('sender', storage)).toEqual([record()]);
		expect(onOutcome).not.toHaveBeenCalled();
	});

	it('keeps group A tracked while only rejected group B is retried', async () => {
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
		const recipients = [[{ address: 'A', amount: '1' }], [{ address: 'B', amount: '2' }]];
		const active = tracker();
		const send = vi.fn(async (group: Uint8Array[]) => {
			if (group[0] === groups[1][0]) throw Object.assign(new Error('refused'), { status: 400 });
		});
		const waitForConfirmation = async () => {
			throw new Error('lost wait');
		};
		const outcomes: Outcome[] = [];
		await sendGroups(groups, {
			send,
			waitForConfirmation,
			onOutcome: createOutcomeHandler({
				tracker: active,
				record: (pending, index) => record({ ...pending, recipients: recipients[index] }),
				signal: new AbortController().signal,
				onOutcome: (outcome, index) => {
					outcomes[index] = outcome;
				}
			})
		});
		expect(retryRecipients(outcomes, recipients)).toEqual(recipients[1]);
		const retryGroups = retryRecipients(outcomes, groups);
		const polls = vi.mocked(deps.pendingInfo).mock.calls.length;
		send.mockClear();
		await sendGroups([retryGroups], { send, waitForConfirmation });
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith(groups[1]);
		expect(send).not.toHaveBeenCalledWith(groups[0]);
		await vi.advanceTimersByTimeAsync(3);
		expect(active.entries()[0].status).toBe('pending');
		expect(vi.mocked(deps.pendingInfo).mock.calls.length).toBeGreaterThan(polls);
		expect(deps.pendingInfo).toHaveBeenLastCalledWith(outcomes[0].txIds[0]);
	});
});
