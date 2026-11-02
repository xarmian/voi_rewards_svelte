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

	it('remembers the unresolved tx id per contract', () => {
		rememberPendingWithdrawal(1, 'TX-A');
		rememberPendingWithdrawal(2, 'TX-B');
		expect(getPendingWithdrawal(1)).toBe('TX-A');
		expect(getPendingWithdrawal(2)).toBe('TX-B');
	});

	it('keeps the latest tx id when a contract is remembered twice', () => {
		rememberPendingWithdrawal(1, 'TX-A');
		rememberPendingWithdrawal(1, 'TX-C');
		expect(getPendingWithdrawal(1)).toBe('TX-C');
	});

	it('clears only the named contract', () => {
		rememberPendingWithdrawal(1, 'TX-A');
		rememberPendingWithdrawal(2, 'TX-B');
		clearPendingWithdrawal(1);
		expect(getPendingWithdrawal(1)).toBeUndefined();
		expect(getPendingWithdrawal(2)).toBe('TX-B');
	});
});
