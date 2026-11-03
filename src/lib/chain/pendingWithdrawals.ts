export type PendingWithdrawal = { txId: string; lastValid: number; createdAt: number };
export type PendingWithdrawalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> &
	Partial<Pick<Storage, 'key' | 'length'>>;

const prefix = 'voirewards:pending-withdrawal:';
const memory = new Map<string, PendingWithdrawal>();
const knownKeys = new Set<string>();

export function pendingWithdrawalStorageKey(wallet: string, contractId: number): string {
	return `${prefix}${wallet}:${contractId}`;
}

// Resolve on each call so importing this module during SSR never captures browser storage.
function resolveStorage(storage?: PendingWithdrawalStorage): PendingWithdrawalStorage | undefined {
	return storage ?? globalThis.localStorage;
}

function readEntry(key: string, storage?: PendingWithdrawalStorage): PendingWithdrawal | undefined {
	try {
		const resolved = resolveStorage(storage);
		const value = resolved ? JSON.parse(resolved.getItem(key) ?? 'null') : memory.get(key);
		if (
			value &&
			typeof value === 'object' &&
			!Array.isArray(value) &&
			typeof value.txId === 'string' &&
			value.txId.length > 0 &&
			Number.isFinite(value.lastValid) &&
			Number.isFinite(value.createdAt)
		) {
			return value;
		}
	} catch {
		return undefined;
	}
}

export function rememberPendingWithdrawal(
	wallet: string,
	contractId: number,
	entry: PendingWithdrawal,
	storage?: PendingWithdrawalStorage
): void {
	const key = pendingWithdrawalStorageKey(wallet, contractId);
	knownKeys.add(key);
	const resolved = resolveStorage(storage);
	// A failed persistent write must propagate: callers must not broadcast without the record.
	if (resolved) resolved.setItem(key, JSON.stringify(entry));
	memory.set(key, entry);
}

export function getPendingWithdrawal(
	wallet: string,
	contractId: number,
	storage?: PendingWithdrawalStorage
): PendingWithdrawal | undefined {
	const key = pendingWithdrawalStorageKey(wallet, contractId);
	knownKeys.add(key);
	return readEntry(key, storage);
}

export function clearPendingWithdrawal(
	wallet: string,
	contractId: number,
	txId: string,
	storage?: PendingWithdrawalStorage
): void {
	const key = pendingWithdrawalStorageKey(wallet, contractId);
	try {
		if (readEntry(key, storage)?.txId !== txId) return;
		resolveStorage(storage)?.removeItem(key);
	} catch {
		// A persisted record that cannot be removed will be resolved again on the next open.
	} finally {
		if (memory.get(key)?.txId === txId) memory.delete(key);
	}
}

export function resetPendingWithdrawals(storage?: PendingWithdrawalStorage): void {
	const resolved = resolveStorage(storage);
	if (resolved) {
		const keys = new Set(knownKeys);
		for (let index = 0; index < (resolved.length ?? 0); index++) {
			const key = resolved.key?.(index);
			if (key?.startsWith(prefix)) keys.add(key);
		}
		for (const key of keys) {
			if (key.startsWith(prefix)) resolved.removeItem(key);
		}
	}
	memory.clear();
}
