// Withdrawals whose confirmation is still unknown, keyed by contract id. The modal is
// unmounted on close, so without this a reopened modal would offer a second withdrawal while
// the first may still land (TASK-116). Held in memory for the page session only.
const unresolved = new Map<number, string>();

export function rememberPendingWithdrawal(contractId: number, txId: string): void {
	unresolved.set(contractId, txId);
}

export function getPendingWithdrawal(contractId: number): string | undefined {
	return unresolved.get(contractId);
}

export function clearPendingWithdrawal(contractId: number): void {
	unresolved.delete(contractId);
}
