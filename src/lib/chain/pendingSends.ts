import {
	trackPending,
	type Outcome,
	type PendingOutcome,
	type TrackedOutcome,
	type TrackingDependencies
} from './sendAndConfirm';

export type PendingSendRecord = {
	kind: 'send' | 'bridge';
	wallet: string;
	txIds: string[];
	firstTxId: string;
	lastValid: number;
	recipients: { address: string; amount: string }[];
	symbol: string;
	createdAt: number;
};

type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (wallet: string) => `voirewards:pending-sends:${wallet}`;

function validRecord(value: unknown, wallet: string): value is PendingSendRecord {
	if (typeof value !== 'object' || value === null) return false;
	const entry = value as Partial<PendingSendRecord>;
	return (
		(entry.kind === 'send' || entry.kind === 'bridge') &&
		entry.wallet === wallet &&
		Array.isArray(entry.txIds) &&
		entry.txIds.length > 0 &&
		entry.txIds.every((id) => typeof id === 'string') &&
		typeof entry.firstTxId === 'string' &&
		typeof entry.lastValid === 'number' &&
		Number.isFinite(entry.lastValid) &&
		Array.isArray(entry.recipients) &&
		entry.recipients.every(
			(recipient) =>
				typeof recipient === 'object' &&
				recipient !== null &&
				typeof recipient.address === 'string' &&
				typeof recipient.amount === 'string'
		) &&
		typeof entry.symbol === 'string' &&
		typeof entry.createdAt === 'number' &&
		Number.isFinite(entry.createdAt)
	);
}

export function loadPending(wallet: string, storage?: PendingStorage): PendingSendRecord[] {
	try {
		const saved: unknown = JSON.parse(
			(storage ?? globalThis.localStorage)?.getItem(key(wallet)) ?? '[]'
		);
		return Array.isArray(saved) ? saved.filter((entry) => validRecord(entry, wallet)) : [];
	} catch {
		return [];
	}
}

export function addPending(record: PendingSendRecord, storage?: PendingStorage): void {
	try {
		const records = loadPending(record.wallet, storage);
		if (!records.some((entry) => entry.firstTxId === record.firstTxId)) records.push(record);
		(storage ?? globalThis.localStorage)?.setItem(key(record.wallet), JSON.stringify(records));
	} catch {
		/* Storage is optional, including access to localStorage itself. */
	}
}

export function removePending(wallet: string, firstTxId: string, storage?: PendingStorage): void {
	try {
		const records = loadPending(wallet, storage).filter((entry) => entry.firstTxId !== firstTxId);
		const target = storage ?? globalThis.localStorage;
		if (records.length) target?.setItem(key(wallet), JSON.stringify(records));
		else target?.removeItem(key(wallet));
	} catch {
		/* Storage is optional. */
	}
}

export type PendingSendEntry = {
	record: PendingSendRecord;
	status: 'pending' | 'confirmed' | 'expired';
	confirmedRound?: number;
};

export type PendingTracker = {
	add(record: PendingSendRecord): Promise<TrackedOutcome>;
	resume(): void;
	stop(): void;
	entries(): PendingSendEntry[];
};

function pendingOutcome(record: PendingSendRecord): PendingOutcome {
	return {
		status: 'pending',
		txIds: record.txIds,
		firstTxId: record.firstTxId,
		lastValid: record.lastValid
	};
}

export function createPendingTracker({
	wallet,
	deps,
	storage,
	intervalMs,
	onChange
}: {
	wallet: string;
	deps: TrackingDependencies;
	storage?: PendingStorage;
	intervalMs?: number;
	onChange: (entries: PendingSendEntry[]) => void;
}): PendingTracker {
	type Item = {
		entry: PendingSendEntry;
		controller?: AbortController;
		tracking?: Promise<TrackedOutcome>;
	};
	const items = new Map<string, Item>();
	let running = true;
	const entries = () =>
		Array.from(items.values(), ({ entry }) => ({
			...entry,
			record: {
				...entry.record,
				txIds: [...entry.record.txIds],
				recipients: entry.record.recipients.map((recipient) => ({ ...recipient }))
			}
		}));

	function start(item: Item): Promise<TrackedOutcome> {
		const { entry } = item;
		const pending = pendingOutcome(entry.record);
		if (entry.status === 'confirmed') {
			return Promise.resolve({
				status: 'confirmed',
				txIds: pending.txIds,
				confirmedRound: entry.confirmedRound ?? 0
			});
		}
		if (entry.status === 'expired')
			return Promise.resolve({ status: 'expired', txIds: pending.txIds });
		if (!running) return Promise.resolve(pending);
		if (item.tracking) return item.tracking;
		const controller = new AbortController();
		item.controller = controller;
		item.tracking = trackPending(pending, deps, { intervalMs, signal: controller.signal })
			.then((outcome) => {
				// A stopped poll may finish after resume has already started a replacement.
				if (controller.signal.aborted || item.controller !== controller) return pending;
				if (outcome.status === 'confirmed' || outcome.status === 'expired') {
					item.entry = {
						record: entry.record,
						status: outcome.status,
						...(outcome.status === 'confirmed' ? { confirmedRound: outcome.confirmedRound } : {})
					};
					removePending(wallet, entry.record.firstTxId, storage);
					onChange(entries());
				}
				return outcome;
			})
			.finally(() => {
				if (item.controller === controller) {
					item.controller = undefined;
					item.tracking = undefined;
				}
			});
		return item.tracking;
	}

	return {
		async add(record) {
			addPending(record, storage);
			let item = items.get(record.firstTxId);
			if (!item) {
				item = { entry: { record, status: 'pending' } };
				items.set(record.firstTxId, item);
			} else if (item.entry.status !== 'pending') {
				removePending(wallet, record.firstTxId, storage);
			}
			onChange(entries());
			return start(item);
		},
		resume() {
			running = true;
			for (const record of loadPending(wallet, storage)) {
				if (!items.has(record.firstTxId))
					items.set(record.firstTxId, { entry: { record, status: 'pending' } });
			}
			onChange(entries());
			for (const item of items.values()) void start(item);
		},
		stop() {
			running = false;
			for (const item of items.values()) {
				item.controller?.abort();
				item.controller = undefined;
				item.tracking = undefined;
			}
		},
		entries
	};
}

// Capture this handler's tracker and display data before starting the send. A late
// outcome must still be saved after the modal has closed and reset its form.
export function createOutcomeHandler({
	tracker,
	record,
	signal,
	onOutcome
}: {
	tracker: Pick<PendingTracker, 'add'>;
	record: (outcome: PendingOutcome, index: number) => PendingSendRecord;
	signal: AbortSignal;
	onOutcome: (outcome: Outcome, index: number) => void;
}): (outcome: Outcome, index: number) => void {
	return (outcome, index) => {
		if (outcome.status === 'pending') void tracker.add(record(outcome, index));
		if (signal.aborted) return;
		onOutcome(outcome, index);
	};
}
