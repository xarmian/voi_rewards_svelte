// Withdrawals whose confirmation is still unknown, keyed by contract id. The modal is
// unmounted on close, so without this a reopened modal would offer a second withdrawal while
// the first may still land (TASK-116). lastValid lets the caller prove a withdrawal can no
// longer land, so a dropped one does not block the contract. Held in memory for the page
// session only.
export type PendingWithdrawal = { txId: string; lastValid: number };

const unresolved = new Map<number, PendingWithdrawal>();

export function rememberPendingWithdrawal(contractId: number, entry: PendingWithdrawal): void {
	unresolved.set(contractId, entry);
}

export function getPendingWithdrawal(contractId: number): PendingWithdrawal | undefined {
	return unresolved.get(contractId);
}

// Clears only if that transaction is still the recorded one, so a wait that outlived its
// modal cannot erase the record of a newer withdrawal.
export function clearPendingWithdrawal(contractId: number, txId: string): void {
	if (unresolved.get(contractId)?.txId !== txId) return;
	unresolved.delete(contractId);
}

export function resetPendingWithdrawals(): void {
	unresolved.clear();
}
