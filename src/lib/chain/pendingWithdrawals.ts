export type PendingWithdrawal = { txId: string; lastValid: number; createdAt: number };
export type PendingWithdrawalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type Records = Record<string, PendingWithdrawal>;
const memory = new Map<string, Records>();
const knownKeys = new Set<string>();

export function pendingWithdrawalStorageKey(wallet: string): string {
	return `voirewards:pending-withdrawals:${wallet}`;
}

// Resolve on each call so importing this module during SSR never captures browser storage.
function resolveStorage(storage?: PendingWithdrawalStorage): PendingWithdrawalStorage | undefined {
	return storage ?? globalThis.localStorage;
}

function readRecords(key: string, storage?: PendingWithdrawalStorage): Records {
	try {
		const resolved = resolveStorage(storage);
		const value: unknown = resolved
			? JSON.parse(resolved.getItem(key) ?? '{}')
			: (memory.get(key) ?? {});
		if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
		return Object.fromEntries(
			Object.entries(value).filter(
				([, entry]) =>
					entry &&
					typeof entry.txId === 'string' &&
					entry.txId.length > 0 &&
					Number.isFinite(entry.lastValid) &&
					Number.isFinite(entry.createdAt)
			)
		);
	} catch {
		return {};
	}
}

export function rememberPendingWithdrawal(
	wallet: string,
	contractId: number,
	entry: PendingWithdrawal,
	storage?: PendingWithdrawalStorage
): void {
	const key = pendingWithdrawalStorageKey(wallet);
	knownKeys.add(key);
	const records = { ...readRecords(key, storage), [String(contractId)]: entry };
	const resolved = resolveStorage(storage);
	// A failed persistent write must propagate: callers must not broadcast without the record.
	if (resolved) resolved.setItem(key, JSON.stringify(records));
	else memory.set(key, records);
}

export function getPendingWithdrawal(
	wallet: string,
	contractId: number,
	storage?: PendingWithdrawalStorage
): PendingWithdrawal | undefined {
	const key = pendingWithdrawalStorageKey(wallet);
	knownKeys.add(key);
	return readRecords(key, storage)[String(contractId)];
}

export function clearPendingWithdrawal(
	wallet: string,
	contractId: number,
	txId: string,
	storage?: PendingWithdrawalStorage
): void {
	const key = pendingWithdrawalStorageKey(wallet);
	const records = { ...readRecords(key, storage) };
	if (records[String(contractId)]?.txId !== txId) return;
	delete records[String(contractId)];
	const resolved = resolveStorage(storage);
	if (resolved) {
		if (Object.keys(records).length) resolved.setItem(key, JSON.stringify(records));
		else resolved.removeItem(key);
	} else {
		memory.set(key, records);
	}
}

export function resetPendingWithdrawals(storage?: PendingWithdrawalStorage): void {
	const resolved = resolveStorage(storage);
	if (resolved) {
		for (const key of knownKeys) resolved.removeItem(key);
	} else {
		memory.clear();
	}
}
