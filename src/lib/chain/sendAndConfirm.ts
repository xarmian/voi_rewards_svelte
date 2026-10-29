import algosdk from 'algosdk';

export type PendingOutcome = {
	status: 'pending';
	txIds: string[];
	firstTxId: string;
	lastValid: number;
};

export type Outcome =
	| { status: 'confirmed'; txIds: string[]; confirmedRound: number }
	| PendingOutcome
	| { status: 'rejected'; txIds: string[]; error: string };

export type TrackedOutcome = Outcome | { status: 'expired'; txIds: string[] };

export type SendDependencies = {
	send(group: Uint8Array[]): Promise<unknown>;
	waitForConfirmation(txId: string): Promise<{ 'confirmed-round'?: number }>;
};

type TrackingDependencies = {
	pendingInfo(txId: string): Promise<{ 'confirmed-round'?: number; 'pool-error'?: string }>;
	indexerLookup(txId: string): Promise<{ transaction?: { 'confirmed-round'?: number } }>;
	currentRound(): Promise<number>;
	indexerRound(): Promise<number>;
};

export function groupInfo(signedGroup: Uint8Array[]) {
	if (signedGroup.length === 0) throw new Error('Cannot send an empty transaction group');
	const transactions = signedGroup.map((stxn) => algosdk.decodeSignedTransaction(stxn).txn);
	const txIds = transactions.map((txn) => txn.txID());
	return {
		txIds,
		firstTxId: txIds[0],
		lastValid: Math.min(...transactions.map((txn) => txn.lastRound))
	};
}

function httpStatus(error: unknown): number | undefined {
	if (typeof error === 'object' && error !== null && 'status' in error) {
		return typeof error.status === 'number' ? error.status : undefined;
	}
}

export async function sendAndConfirm(
	signedGroup: Uint8Array[],
	deps: SendDependencies
): Promise<Outcome> {
	// Retain the signed txids even if the POST response or confirmation wait is lost.
	const pending: PendingOutcome = { status: 'pending', ...groupInfo(signedGroup) };
	try {
		await deps.send(signedGroup);
	} catch (error) {
		const status = httpStatus(error);
		if (status !== undefined && status >= 400 && status < 500) {
			return {
				status: 'rejected',
				txIds: pending.txIds,
				error: error instanceof Error ? error.message : String(error)
			};
		}
		return pending;
	}

	try {
		const confirmation = await deps.waitForConfirmation(pending.firstTxId);
		const confirmedRound = confirmation['confirmed-round'];
		if (confirmedRound !== undefined && confirmedRound > 0) {
			return { status: 'confirmed', txIds: pending.txIds, confirmedRound };
		}
	} catch {
		return pending;
	}
	return pending;
}

async function unknownOnError<T>(lookup: () => Promise<T>): Promise<T | undefined> {
	try {
		return await lookup();
	} catch {
		return undefined;
	}
}

function pause(intervalMs: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal?.aborted) return resolve();
		const timer = setTimeout(finish, intervalMs);
		signal?.addEventListener('abort', finish, { once: true });
		function finish() {
			clearTimeout(timer);
			signal?.removeEventListener('abort', finish);
			resolve();
		}
	});
}

export async function trackPending(
	outcome: PendingOutcome,
	deps: TrackingDependencies,
	{ intervalMs = 4000, signal }: { intervalMs?: number; signal?: AbortSignal } = {}
): Promise<TrackedOutcome> {
	if (signal?.aborted) return outcome;
	async function poll(): Promise<TrackedOutcome> {
		while (!signal?.aborted) {
			const info = await unknownOnError(() => deps.pendingInfo(outcome.firstTxId));
			if (signal?.aborted) break;
			const confirmedRound = info?.['confirmed-round'];
			if (confirmedRound !== undefined && confirmedRound > 0) {
				return { status: 'confirmed', txIds: outcome.txIds, confirmedRound };
			}
			if (info?.['pool-error']?.trim()) {
				return { status: 'rejected', txIds: outcome.txIds, error: info['pool-error'] };
			}

			const [currentRound, indexerRound] = await Promise.all([
				unknownOnError(() => deps.currentRound()),
				unknownOnError(() => deps.indexerRound())
			]);
			if (signal?.aborted) break;
			// Check absence AFTER the indexer's round, so a stale lookup cannot permit a retry.
			let missing = false;
			try {
				const indexed = await deps.indexerLookup(outcome.firstTxId);
				if (signal?.aborted) break;
				if (indexed.transaction) {
					return {
						status: 'confirmed',
						txIds: outcome.txIds,
						confirmedRound: indexed.transaction['confirmed-round'] ?? 0
					};
				}
				missing = true;
			} catch (error) {
				// A transient lookup failure cannot prove that a transaction never landed.
				missing = httpStatus(error) === 404;
			}
			if (signal?.aborted) break;
			if (
				missing &&
				currentRound !== undefined &&
				currentRound > outcome.lastValid &&
				indexerRound !== undefined &&
				indexerRound > outcome.lastValid
			) {
				return { status: 'expired', txIds: outcome.txIds };
			}
			await pause(intervalMs, signal);
		}
		return outcome;
	}

	let onAbort: (() => void) | undefined;
	const aborted = new Promise<TrackedOutcome>((resolve) => {
		onAbort = () => resolve(outcome);
		signal?.addEventListener('abort', onAbort, { once: true });
	});
	try {
		// Resolve promptly even if a lookup is still in flight when the modal closes.
		return await Promise.race([poll(), aborted]);
	} finally {
		if (onAbort) signal?.removeEventListener('abort', onAbort);
	}
}

export function retryable(outcomes: readonly (TrackedOutcome | undefined)[]): number[] {
	return outcomes.flatMap((outcome, index) =>
		outcome?.status === 'rejected' || outcome?.status === 'expired' ? [index] : []
	);
}
