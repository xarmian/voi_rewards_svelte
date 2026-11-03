import { matchBridgeConfirmation, type ExpectedBridgeConfirmation } from './bridgeConfirmation';

export interface BridgeFetchDeps {
	getJson(url: string, signal: AbortSignal): Promise<unknown>;
}

interface AlgorandDepositDeps extends BridgeFetchDeps {
	algodBase: string;
	indexerBase: string;
	nowMs(): number;
}

type ExpectedBridgeDeposit = {
	assetId: number;
	bridgeAddress: string;
	amount: bigint | number | string;
	destinationAddress: string;
	sourceAddress?: string;
};
type MonitorResult = { done: true; tx: { id: string } } | { done: false };

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function transactions(data: unknown): unknown[] {
	if (!isObject(data) || !Array.isArray(data.transactions))
		throw new Error('Unexpected indexer response');
	return data.transactions;
}

export function confirmationUrl(indexerBase: string, destinationAddress: string): string {
	return `${indexerBase}/v2/transactions?note-prefix=${encodeURIComponent(btoa('aramid-confirm/v1:j'))}&address=${destinationAddress}&limit=50`;
}

export async function checkDestinationConfirmation(
	deps: BridgeFetchDeps,
	indexerBase: string,
	expected: ExpectedBridgeConfirmation,
	signal: AbortSignal
): Promise<
	| { done: true; tx: { id: string } }
	| { done: false; review?: { expected: bigint; actual: bigint } }
> {
	const data = await deps.getJson(
		confirmationUrl(indexerBase, expected.destinationAddress),
		signal
	);
	let review: { expected: bigint; actual: bigint } | undefined;
	for (const tx of transactions(data)) {
		const match = matchBridgeConfirmation(tx, expected);
		if (match.status === 'match' && isObject(tx) && typeof tx.id === 'string')
			return { done: true, tx: { id: tx.id } };
		if (match.status === 'amount-mismatch')
			review ??= { expected: match.expected, actual: match.actual };
	}
	return review ? { done: false, review } : { done: false };
}

function integerAmount(value: unknown): bigint | undefined {
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || !Number.isInteger(value)) return;
	} else if (typeof value === 'string') {
		if (!value.trim()) return;
	} else if (typeof value !== 'bigint') return;
	return BigInt(value);
}

export function matchBridgeDeposit(tx: unknown, expected: ExpectedBridgeDeposit): boolean {
	try {
		if (!isObject(tx) || tx['tx-type'] !== 'axfer') return false;
		const transfer = tx['asset-transfer-transaction'];
		if (
			!isObject(transfer) ||
			transfer['asset-id'] !== expected.assetId ||
			transfer.receiver !== expected.bridgeAddress
		)
			return false;
		const amount = integerAmount(transfer.amount);
		if (amount === undefined || amount !== integerAmount(expected.amount)) return false;
		if (typeof tx.note !== 'string') return false;
		const bytes = Uint8Array.from(atob(tx.note), (character) => character.charCodeAt(0));
		const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		const prefix = 'aramid-transfer/v1:j';
		if (!decoded.startsWith(prefix)) return false;
		const note: unknown = JSON.parse(decoded.slice(prefix.length));
		return (
			isObject(note) &&
			note.destinationAddress === expected.destinationAddress &&
			(expected.sourceAddress === undefined || tx.sender === expected.sourceAddress)
		);
	} catch {
		return false;
	}
}

export async function checkAlgorandDeposit(
	deps: AlgorandDepositDeps,
	expected: ExpectedBridgeDeposit,
	state: { startRound: number | null; startedAtMs: number },
	signal: AbortSignal
): Promise<MonitorResult> {
	if (state.startRound === null) {
		const status = await deps.getJson(`${deps.algodBase}/v2/status`, signal);
		const lastRound = isObject(status) ? status['last-round'] : undefined;
		if (
			typeof lastRound !== 'number' ||
			!Number.isFinite(lastRound) ||
			!Number.isInteger(lastRound) ||
			lastRound < 0
		)
			throw new Error('Unexpected algod response');
		state.startRound = Math.max(
			0,
			lastRound - Math.ceil((deps.nowMs() - state.startedAtMs) / 2000) - 2
		);
	}
	const baseUrl = `${deps.indexerBase}/v2/transactions?note-prefix=${encodeURIComponent(btoa('aramid-transfer/v1:j'))}&min-round=${state.startRound}&limit=50`;
	let url = baseUrl;
	for (let page = 0; page < 3; page++) {
		const data = await deps.getJson(url, signal);
		for (const tx of transactions(data)) {
			if (matchBridgeDeposit(tx, expected) && isObject(tx) && typeof tx.id === 'string')
				return { done: true, tx: { id: tx.id } };
		}
		const next = isObject(data) ? data['next-token'] : undefined;
		if (typeof next !== 'string' || !next) break;
		url = `${baseUrl}&next=${encodeURIComponent(next)}`;
	}
	return { done: false };
}
