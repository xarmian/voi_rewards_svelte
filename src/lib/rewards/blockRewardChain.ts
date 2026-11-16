import type { Algodv2, Indexer } from 'algosdk';
import { algodClient, algodIndexer } from '$lib/utils/algod';
import { FEE_SINK_ADDRESS } from './blockRewardConstants';

export type ChainClients = {
	algod: Pick<Algodv2, 'supply' | 'accountInformation' | 'status'>;
	indexer: Pick<Indexer, 'makeHealthCheck' | 'lookupBlock'>;
};

const BLOCK_RETRY_OFFSET = 5;

const defaults = (): ChainClients => ({ algod: algodClient, indexer: algodIndexer });

function integer(value: unknown, label: string, min: number): number {
	const number = typeof value === 'bigint' ? Number(value) : value;
	if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < min)
		throw new Error(`Invalid ${label}`);
	return number;
}

function isNotFound(cause: unknown): boolean {
	if (!cause || typeof cause !== 'object') return false;
	const error = cause as { status?: unknown; response?: { status?: unknown } };
	return error.status === 404 || error.response?.status === 404;
}

/** Current proposer bonus in micro-VOI, read from the latest indexed block header. */
export async function readBonus(
	clients: ChainClients = defaults()
): Promise<{ bonus: number; round: number }> {
	const health = await clients.indexer.makeHealthCheck().do();
	const latest = integer(health?.round, 'indexer round', 1);
	const header = async (round: number) => clients.indexer.lookupBlock(round).headerOnly(true).do();
	let round = latest;
	let block;
	try {
		block = await header(round);
	} catch (cause) {
		if (!isNotFound(cause) || latest - BLOCK_RETRY_OFFSET < 1) throw cause;
		round = latest - BLOCK_RETRY_OFFSET;
		block = await header(round);
	}
	return { bonus: integer(block?.bonus, 'block bonus', 1), round };
}

/** Total online stake in micro-VOI. */
export async function readOnlineStake(clients: ChainClients = defaults()): Promise<number> {
	const supply = await clients.algod.supply().do();
	return integer(supply?.onlineMoney, 'online stake', 1);
}

/** Fee sink balance and minimum balance in micro-VOI. */
export async function readFeeSink(
	clients: ChainClients = defaults()
): Promise<{ amount: number; minBalance: number }> {
	const account = await clients.algod.accountInformation(FEE_SINK_ADDRESS).exclude('all').do();
	return {
		amount: integer(account?.amount, 'fee sink balance', 0),
		minBalance: integer(account?.minBalance, 'fee sink minimum balance', 0)
	};
}

/** Latest round known to algod. */
export async function readLastRound(clients: ChainClients = defaults()): Promise<number> {
	const status = await clients.algod.status().do();
	return integer(status?.lastRound, 'last round', 1);
}
