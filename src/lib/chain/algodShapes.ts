// algosdk 3 returns typed responses with camelCase keys and bigint rounds, and puts an HTTP
// error's status on `error.response.status`. The send/track logic in this folder is written
// against plain numbers and a status it can read, so the conversion happens here, once, at
// the algod boundary (TASK-145).

/** The HTTP status of a failed algod or indexer request, or undefined when there was none. */
export function httpStatus(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null || !('response' in error)) return undefined;
	const response = error.response;
	if (typeof response !== 'object' || response === null || !('status' in response))
		return undefined;
	return typeof response.status === 'number' ? response.status : undefined;
}

/** A round as a number, or undefined when the node did not report one. */
export function roundNumber(round: bigint | number | undefined): number | undefined {
	return round === undefined ? undefined : Number(round);
}

export type PendingInfo = { 'confirmed-round'?: number; 'pool-error'?: string };

/** What a pending-transaction lookup says, in the shape the confirmation logic reads. */
export function pendingInfoFrom(info: {
	confirmedRound?: bigint | number;
	poolError?: string;
}): PendingInfo {
	const confirmedRound = roundNumber(info.confirmedRound);
	return {
		...(confirmedRound !== undefined ? { 'confirmed-round': confirmedRound } : {}),
		...(info.poolError ? { 'pool-error': info.poolError } : {})
	};
}

export type GlobalStateEntry = {
	key: string;
	value: { type: number; bytes: string; uint: bigint | number };
};

/**
 * An application's global state in the form the contract decoders read: base64 keys and bytes,
 * a numeric type, and the uint left as the exact bigint algosdk 3 reports.
 */
export function globalStateEntries(
	state:
		| readonly {
				key: Uint8Array;
				value: { type: bigint | number; bytes: Uint8Array; uint: bigint | number };
		  }[]
		| undefined
): GlobalStateEntry[] {
	return (state ?? []).map(({ key, value }) => ({
		key: Buffer.from(key).toString('base64'),
		value: {
			type: Number(value.type),
			bytes: Buffer.from(value.bytes).toString('base64'),
			uint: value.uint
		}
	}));
}
