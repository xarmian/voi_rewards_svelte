import algosdk from 'algosdk';
import { httpStatus, pendingInfoFrom, roundNumber } from './algodShapes';
import type { SendDependencies, TrackingDependencies } from './sendAndConfirm';

type Request<T> = { do(): Promise<T> };
type SharedRequest<T> = { promise: Promise<T>; startedAtMs: number };
// The parts of algosdk 3's Algodv2 and Indexer this file reads.
type AlgodClient = {
	pendingTransactionInformation(
		txId: string
	): Request<{ confirmedRound?: bigint; poolError?: string }>;
	status(): Request<{ lastRound: bigint }>;
};
type Indexer = {
	searchForTransactions(): {
		txid(txId: string): Request<{
			currentRound: bigint;
			transactions: { id?: string; confirmedRound?: bigint }[];
		}>;
	};
	lookupBlock(round: number): Request<{ round: bigint }>;
};

/** How the send flows post a signed group and wait up to 4 rounds for it to confirm. */
export function createSendDeps(client: algosdk.Algodv2): SendDependencies {
	return {
		send: (group) => client.sendRawTransaction(group).do(),
		waitForConfirmation: async (txId) =>
			pendingInfoFrom(await algosdk.waitForConfirmation(client, txId, 4))
	};
}

export function createTrackingDeps(
	algodClient: AlgodClient,
	indexer: Indexer,
	now: () => number = Date.now,
	staleMs = 15000
): TrackingDependencies {
	let roundRequest: SharedRequest<number> | undefined;
	const blockRequests = new Map<number, SharedRequest<boolean>>();
	return {
		pendingInfo: async (txId) =>
			pendingInfoFrom(await algodClient.pendingTransactionInformation(txId).do()),
		indexerSearch: async (txId) => {
			const found = await indexer.searchForTransactions().txid(txId).do();
			return {
				'current-round': Number(found.currentRound),
				transactions: found.transactions.map((tx) => {
					const confirmedRound = roundNumber(tx.confirmedRound);
					return {
						id: tx.id,
						...(confirmedRound !== undefined ? { 'confirmed-round': confirmedRound } : {})
					};
				})
			};
		},
		algodRound: () => {
			const startedAtMs = now();
			const age = startedAtMs - (roundRequest?.startedAtMs ?? startedAtMs);
			if (!roundRequest || !(age >= 0 && age <= staleMs)) {
				const promise = (async () => Number((await algodClient.status().do()).lastRound))().finally(
					() => {
						if (roundRequest?.promise === promise) roundRequest = undefined;
					}
				);
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
						typeof block === 'object' &&
						block !== null &&
						typeof block.round === 'bigint' &&
						block.round === BigInt(round)
					);
				} catch (error) {
					if (httpStatus(error) === 404) return false;
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
