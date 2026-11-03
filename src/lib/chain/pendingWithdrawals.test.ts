import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearPendingWithdrawal,
	getPendingWithdrawal,
	pendingWithdrawalStorageKey,
	rememberPendingWithdrawal,
	resetPendingWithdrawals
} from './pendingWithdrawals';

function fakeStorage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		}
	};
}
const entry = { txId: 'TX-A', lastValid: 100, createdAt: 1234 };

describe('pending withdrawals', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', undefined);
		resetPendingWithdrawals();
	});
	afterEach(() => vi.unstubAllGlobals());

	it('persists across fresh callers sharing storage, including reloads and other tabs', () => {
		const storage = fakeStorage();
		rememberPendingWithdrawal('wallet-a', 1, entry, storage);
		expect(JSON.parse(storage.getItem(pendingWithdrawalStorageKey('wallet-a'))!)).toEqual({
			'1': entry
		});
		expect(getPendingWithdrawal('wallet-a', 1, { ...storage })).toEqual(entry);
	});

	it('isolates wallets and contracts, and replaces only the same contract', () => {
		const storage = fakeStorage();
		rememberPendingWithdrawal('a', 1, entry, storage);
		rememberPendingWithdrawal('a', 2, { ...entry, txId: 'TX-B' }, storage);
		rememberPendingWithdrawal('b', 1, { ...entry, txId: 'TX-C' }, storage);
		rememberPendingWithdrawal('a', 1, { ...entry, txId: 'TX-D' }, storage);
		expect(getPendingWithdrawal('a', 1, storage)?.txId).toBe('TX-D');
		expect(getPendingWithdrawal('a', 2, storage)?.txId).toBe('TX-B');
		expect(getPendingWithdrawal('b', 1, storage)?.txId).toBe('TX-C');
		expect(getPendingWithdrawal('b', 2, storage)).toBeUndefined();
	});

	it.each([
		'broken',
		'null',
		'[]',
		'{"1":null}',
		'{"1":{"txId":"","lastValid":1,"createdAt":1}}',
		'{"1":{"txId":"A","lastValid":"1","createdAt":1}}',
		'{"1":{"txId":"A","lastValid":1}}',
		'{"1":{"txId":"A","lastValid":1e999,"createdAt":1}}',
		'{"1":{"txId":"A","lastValid":1,"createdAt":1e999}}'
	])('reads corrupt or invalid data as absent: %s', (value) => {
		const storage = fakeStorage();
		storage.setItem(pendingWithdrawalStorageKey('a'), value);
		expect(() => getPendingWithdrawal('a', 1, storage)).not.toThrow();
		expect(getPendingWithdrawal('a', 1, storage)).toBeUndefined();
	});

	it('never throws on a failed storage read', () => {
		const storage = {
			...fakeStorage(),
			getItem: () => {
				throw new Error('blocked');
			}
		};
		expect(getPendingWithdrawal('a', 1, storage)).toBeUndefined();
	});

	it('clears only a matching txid and preserves other wallets and contracts', () => {
		const storage = fakeStorage();
		for (const [wallet, id] of [
			['a', 1],
			['a', 2],
			['b', 1]
		] as const)
			rememberPendingWithdrawal(wallet, id, entry, storage);
		clearPendingWithdrawal('a', 1, 'OLD', storage);
		expect(getPendingWithdrawal('a', 1, storage)).toEqual(entry);
		clearPendingWithdrawal('a', 1, entry.txId, storage);
		expect(getPendingWithdrawal('a', 1, storage)).toBeUndefined();
		expect(getPendingWithdrawal('a', 2, storage)).toEqual(entry);
		expect(getPendingWithdrawal('b', 1, storage)).toEqual(entry);
	});

	it('throws on a failed write instead of silently falling back to memory', () => {
		const storage = {
			...fakeStorage(),
			setItem: () => {
				throw new Error('quota');
			}
		};
		expect(() => rememberPendingWithdrawal('a', 1, entry, storage)).toThrow('quota');
		expect(getPendingWithdrawal('a', 1, storage)).toBeUndefined();
		expect(getPendingWithdrawal('a', 1)).toBeUndefined();
	});

	it('uses memory only when no storage object exists', () => {
		rememberPendingWithdrawal('a', 1, entry, undefined);
		expect(getPendingWithdrawal('a', 1, undefined)).toEqual(entry);
		clearPendingWithdrawal('a', 1, 'OLD');
		expect(getPendingWithdrawal('a', 1)).toEqual(entry);
		clearPendingWithdrawal('a', 1, entry.txId);
		expect(getPendingWithdrawal('a', 1)).toBeUndefined();
	});

	it('resolves localStorage lazily and never touches sessionStorage', () => {
		const storage = fakeStorage();
		const sessionGet = vi.fn();
		vi.stubGlobal('localStorage', storage);
		vi.stubGlobal('sessionStorage', { getItem: sessionGet, setItem: sessionGet });
		rememberPendingWithdrawal('a', 1, entry);
		expect(getPendingWithdrawal('a', 1, storage)).toEqual(entry);
		expect(getPendingWithdrawal('a', 1)).toEqual(entry);
		expect(sessionGet).not.toHaveBeenCalled();
	});

	it('resets records in storage and memory without removing unrelated keys', () => {
		const storage = fakeStorage();
		storage.setItem('other', 'keep');
		for (const wallet of ['a', 'b']) {
			rememberPendingWithdrawal(wallet, 1, entry, storage);
			rememberPendingWithdrawal(wallet, 1, entry);
		}
		resetPendingWithdrawals(storage);
		resetPendingWithdrawals();
		for (const wallet of ['a', 'b']) {
			expect(getPendingWithdrawal(wallet, 1, storage)).toBeUndefined();
			expect(getPendingWithdrawal(wallet, 1)).toBeUndefined();
		}
		expect(storage.getItem('other')).toBe('keep');
	});

	it('has a stable key per wallet', () => {
		expect(pendingWithdrawalStorageKey('a')).toBe('voirewards:pending-withdrawals:a');
		expect(pendingWithdrawalStorageKey('b')).not.toBe(pendingWithdrawalStorageKey('a'));
	});
});
