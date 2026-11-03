import type { TrackingDependencies } from './sendAndConfirm';

type Request<T> = { do(): Promise<T> };
type SharedRequest<T> = { promise: Promise<T>; startedAtMs: number };
type AlgodClient = {
	pendingTransactionInformation(txId: string): Request<{ 'confirmed-round'?: number }>;
	status(): Request<Record<string, unknown>>;
};
type Indexer = {
	searchForTransactions(): { txid(txId: string): Request<unknown> };
	lookupBlock(round: number): Request<unknown>;
};

export function createTrackingDeps(
	algodClient: AlgodClient,
	indexer: Indexer,
	now: () => number = Date.now,
	staleMs = 15000
): TrackingDependencies {
	let roundRequest: SharedRequest<number> | undefined;
	const blockRequests = new Map<number, SharedRequest<boolean>>();
	return {
		pendingInfo: (txId) => algodClient.pendingTransactionInformation(txId).do(),
		indexerSearch: async (txId) =>
			(await indexer.searchForTransactions().txid(txId).do()) as {
				'current-round': number;
				transactions: { id?: string; 'confirmed-round'?: number }[];
			},
		algodRound: () => {
			const startedAtMs = now();
			const age = startedAtMs - (roundRequest?.startedAtMs ?? startedAtMs);
			if (!roundRequest || !(age >= 0 && age <= staleMs)) {
				const promise = (async () =>
					(await algodClient.status().do())['last-round'] as number)().finally(() => {
					if (roundRequest?.promise === promise) roundRequest = undefined;
				});
				roundRequest = { promise, startedAtMs };
			}
			return roundRequest.promise;
		},
		indexerHasBlock: (round) => {
			const existing = blockRequests.get(round);
			const startedAtMs = now();
			const age = startedAtMs - (existing?.startedAtMs ?? startedAtMs);
			if (existing && age >= 0 && age <= staleMs) return existing.promise;
			const promise = (async () => {
				try {
					const block = await indexer.lookupBlock(round).do();
					return (
						typeof block === 'object' && block !== null && 'round' in block && block.round === round
					);
				} catch (error) {
					if (
						typeof error === 'object' &&
						error !== null &&
						'status' in error &&
						error.status === 404
					)
						return false;
					throw error;
				}
			})().finally(() => {
				if (blockRequests.get(round)?.promise === promise) blockRequests.delete(round);
			});
			blockRequests.set(round, { promise, startedAtMs });
			return promise;
		}
	};
}
