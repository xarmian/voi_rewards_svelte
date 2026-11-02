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
	return {
		pendingInfo: (txId) => algodClient.pendingTransactionInformation(txId).do(),
		indexerSearch: async (txId) =>
			(await indexer.searchForTransactions().txid(txId).do()) as {
				'current-round': number;
				transactions: { id?: string; 'confirmed-round'?: number }[];
			},
		algodRound: async () => (await algodClient.status().do())['last-round'] as number,
		indexerHasBlock: async (round) => {
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
		}
	};
}
