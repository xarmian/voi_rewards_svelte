import { assertArc200Bound } from './arc200Export';
import type { ExportRow } from './transactionExport';

// Shared by the proxy validator and the browser reader without a server-only import.
export const ARC72_MAX_ROUND_WINDOW = 1_000_000;
export const ARC72_PAGE_LIMIT = 1000;
// The algosdk zero address, spelled out so the proxy validator does not bundle algosdk.
const ZERO_ADDRESS = 'A'.repeat(52) + 'Y5HFKQ';
export const ARC72_SOURCE_NOTE =
	'NFT transfers are ARC-72 transfer records from Mimir, including mints and burns. If one transaction moves the same NFT more than once, only the first move is recorded.';
export const ARC72_CAP_WARNING =
	'NFT history is scanned in round windows that halve when a window holds more than 1,000 transfers; dense or long histories may reach the cap.';

export interface Arc72Query {
	address: string;
	minRound: bigint;
	maxRound: bigint;
}
export interface Arc72Transfer {
	contractId: bigint;
	tokenId: bigint;
	from: string;
	to: string;
	round: bigint;
	timestamp: number;
	txId: string;
	note: string;
}
export interface Arc72Page {
	transfers: readonly Arc72Transfer[];
	totalCount: number;
	currentRound: bigint;
	nextToken: string | null;
}
export type Arc72Window =
	| { kind: 'split' }
	| { kind: 'cap'; round: bigint }
	| { kind: 'done'; accepted: readonly Arc72Transfer[] };
export type Arc72Event = 'mint' | 'burn' | 'transfer';
// ExportRow gains the arc72 kind and NFT fields with the export leg; until then this is its exact shape.
export type Arc72ExportRow = Omit<ExportRow, 'assetKind' | 'type'> & {
	assetKind: 'arc72';
	type: 'nft-transfer';
	nftTokenId: bigint;
	nftEvent: Arc72Event;
};

function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Invalid ARC-72 record.');
	return value as Record<string, unknown>;
}
function safeInteger(value: unknown, min: number): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min)
		throw new Error('ARC-72 round, timestamp or count is not a safe integer.');
	return value;
}
function nullableText(value: unknown): string {
	if (value === null) return '';
	if (typeof value !== 'string') throw new Error('Invalid ARC-72 text field.');
	return value;
}
export function assertArc72Query(query: Arc72Query): void {
	assertArc200Bound(query.minRound);
	assertArc200Bound(query.maxRound);
	if (
		query.minRound > query.maxRound ||
		query.maxRound - query.minRound > BigInt(ARC72_MAX_ROUND_WINDOW)
	)
		throw new Error('Invalid ARC-72 round window.');
}
function decimal(value: unknown, label: string): bigint {
	if (typeof value !== 'string' || !/^\d+$/.test(value))
		throw new Error(`ARC-72 ${label} must be decimal text.`);
	return BigInt(value);
}
function normalizeTransfer(
	raw: unknown,
	query: Arc72Query,
	isValidAddress: (a: string) => boolean
): Arc72Transfer {
	const row = object(raw);
	const contractId = decimal(row.contractId, 'contract ID');
	assertArc200Bound(contractId);
	const tokenId = decimal(row.tokenId, 'token ID');
	if (tokenId >= 1n << 256n) throw new Error('ARC-72 token ID exceeds uint256.');
	const { fromAddr: from, toAddr: to } = row;
	if (
		typeof from !== 'string' ||
		!isValidAddress(from) ||
		typeof to !== 'string' ||
		!isValidAddress(to)
	)
		throw new Error('Invalid ARC-72 transfer address.');
	if (from !== query.address && to !== query.address)
		throw new Error('ARC-72 transfer does not involve the queried account.');
	// The source aggregates without an ORDER BY, so only the window is checked, not the order.
	const round = BigInt(safeInteger(row.round, 1));
	if (round < query.minRound || round > query.maxRound)
		throw new Error('ARC-72 round is outside the window.');
	const timestamp = safeInteger(row.timestamp, 0);
	if (!Number.isFinite(new Date(timestamp * 1000).getTime()))
		throw new Error('Invalid ARC-72 timestamp.');
	return {
		contractId,
		tokenId,
		from,
		to,
		round,
		timestamp,
		txId: nullableText(row.transactionId),
		note: nullableText(row.note)
	};
}
export function normalizeArc72Page(
	value: unknown,
	query: Arc72Query,
	isValidAddress: (a: string) => boolean
): Arc72Page {
	assertArc72Query(query);
	const body = object(value);
	if (!Array.isArray(body.transfers) || body.transfers.length > ARC72_PAGE_LIMIT)
		throw new Error('Invalid ARC-72 page size.');
	const totalCount = safeInteger(body['total-count'], 0);
	const currentRound = BigInt(safeInteger(body['current-round'], 1));
	const nextToken = body['next-token'];
	if (nextToken !== null && typeof nextToken !== 'string')
		throw new Error('Invalid ARC-72 next token.');
	return {
		transfers: body.transfers.map((raw) => normalizeTransfer(raw, query, isValidAddress)),
		totalCount,
		currentRound,
		nextToken
	};
}
export function arc72CurrentRound(value: unknown): bigint | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	const round = (value as Record<string, unknown>)['current-round'];
	return typeof round === 'number' && Number.isSafeInteger(round) && round >= 1
		? BigInt(round)
		: undefined;
}
export function selectArc72Window(page: Arc72Page, query: Arc72Query): Arc72Window {
	if (page.totalCount > ARC72_PAGE_LIMIT)
		return query.maxRound > query.minRound
			? { kind: 'split' }
			: { kind: 'cap', round: query.minRound };
	if (page.transfers.length !== page.totalCount || page.nextToken !== null)
		throw new Error('NFT page disagrees with its own total count.');
	return { kind: 'done', accepted: page.transfers };
}
export function mapArc72Transfer(transfer: Arc72Transfer, account: string): Arc72ExportRow {
	return {
		assetKind: 'arc72',
		assetId: transfer.contractId,
		applicationId: transfer.contractId,
		nftTokenId: transfer.tokenId,
		nftEvent:
			transfer.from === ZERO_ADDRESS ? 'mint' : transfer.to === ZERO_ADDRESS ? 'burn' : 'transfer',
		timestamp: transfer.timestamp,
		account,
		txId: transfer.txId,
		innerPath: '',
		group: '',
		transactionType: 'appl',
		type: 'nft-transfer',
		effect: 'amount',
		direction: transfer.from === transfer.to ? 'self' : transfer.from === account ? 'out' : 'in',
		from: transfer.from,
		to: transfer.to,
		amount: 1n,
		fee: 0n,
		round: transfer.round,
		note: transfer.note
	};
}
