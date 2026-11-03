import type { TrackingDependencies } from './sendAndConfirm';

type Request<T> = { do(): Promise<T> };
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
	indexer: Indexer
): TrackingDependencies {
	let roundRequest: Promise<number> | undefined;
	const blockRequests = new Map<number, Promise<boolean>>();
	return {
		pendingInfo: (txId) => algodClient.pendingTransactionInformation(txId).do(),
		indexerSearch: async (txId) =>
			(await indexer.searchForTransactions().txid(txId).do()) as {
				'current-round': number;
				transactions: { id?: string; 'confirmed-round'?: number }[];
			},
		algodRound: () => {
			if (!roundRequest) {
				roundRequest = (async () =>
					(await algodClient.status().do())['last-round'] as number)().finally(() => {
					roundRequest = undefined;
				});
			}
			return roundRequest;
		},
		indexerHasBlock: (round) => {
			const existing = blockRequests.get(round);
			if (existing) return existing;
			const request = (async () => {
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
			})().finally(() => blockRequests.delete(round));
			blockRequests.set(round, request);
			return request;
		}
	};
}
