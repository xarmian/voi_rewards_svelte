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
