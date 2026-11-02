import { beforeEach, describe, expect, it } from 'vitest';
import {
	clearPendingWithdrawal,
	getPendingWithdrawal,
	rememberPendingWithdrawal
} from './pendingWithdrawals';

describe('pending withdrawals', () => {
	beforeEach(() => {
		clearPendingWithdrawal(1);
		clearPendingWithdrawal(2);
	});

	it('returns nothing for a contract with no unresolved withdrawal', () => {
		expect(getPendingWithdrawal(1)).toBeUndefined();
	});

	it('remembers the unresolved tx id and its last valid round per contract', () => {
		rememberPendingWithdrawal(1, { txId: 'TX-A', lastValid: 100 });
		rememberPendingWithdrawal(2, { txId: 'TX-B', lastValid: 200 });
		expect(getPendingWithdrawal(1)).toEqual({ txId: 'TX-A', lastValid: 100 });
		expect(getPendingWithdrawal(2)).toEqual({ txId: 'TX-B', lastValid: 200 });
	});

	it('keeps the latest entry when a contract is remembered twice', () => {
		rememberPendingWithdrawal(1, { txId: 'TX-A', lastValid: 100 });
		rememberPendingWithdrawal(1, { txId: 'TX-C', lastValid: 300 });
		expect(getPendingWithdrawal(1)).toEqual({ txId: 'TX-C', lastValid: 300 });
	});

	it('clears only the named contract', () => {
		rememberPendingWithdrawal(1, { txId: 'TX-A', lastValid: 100 });
		rememberPendingWithdrawal(2, { txId: 'TX-B', lastValid: 200 });
		clearPendingWithdrawal(1);
		expect(getPendingWithdrawal(1)).toBeUndefined();
		expect(getPendingWithdrawal(2)).toEqual({ txId: 'TX-B', lastValid: 200 });
	});

	it('clears only when the recorded tx id matches the one given', () => {
		rememberPendingWithdrawal(1, { txId: 'TX-NEW', lastValid: 300 });
		clearPendingWithdrawal(1, 'TX-OLD');
		expect(getPendingWithdrawal(1)).toEqual({ txId: 'TX-NEW', lastValid: 300 });
		clearPendingWithdrawal(1, 'TX-NEW');
		expect(getPendingWithdrawal(1)).toBeUndefined();
	});
});
