import type { ExportRow } from './transactionExport';

// Shared by the proxy validator and the browser reader without a server-only import.
export const ARC200_MAX_ROUND_WINDOW = 1_000_000;
export const ARC200_SOURCE_WARNING =
	'ARC-200 history is partial: the source may omit transfer logs or lag behind the snapshot. Event identity and order within a round cannot be verified. Missing decimals are exported as raw units.';
export const ARC200_CAP_WARNING =
	'ARC-200 history is scanned in windows of up to 1,000,000 rounds; long date ranges or many accounts may reach the cap.';
export interface Arc200Query {
	address: string;
	minRound: bigint;
	maxRound: bigint;
}
export interface Arc200Transfer {
	contractId: bigint;
	from: string;
	to: string;
	amount: bigint;
	round: bigint;
	timestamp: number;
	txId: string;
	note: string;
}
export interface Arc200Metadata {
	readonly id: bigint;
	readonly decimals: number | null;
	readonly unitName: string;
	readonly name: string;
}
export type Arc200Window =
	| { kind: 'done'; accepted: readonly Arc200Transfer[] }
	| { kind: 'next'; accepted: readonly Arc200Transfer[]; upperRound: bigint }
	| { kind: 'cap'; accepted: readonly []; round: bigint };

function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Invalid ARC-200 record.');
	return value as Record<string, unknown>;
}
function safeInteger(value: unknown, min: number): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min)
		throw new Error('ARC-200 round, timestamp or ID is not a safe integer.');
	return value;
}
export function assertArc200Bound(value: bigint): void {
	if (typeof value !== 'bigint' || value < 1n || value > BigInt(Number.MAX_SAFE_INTEGER))
		throw new Error('ARC-200 IDs and round bounds must be positive safe integers.');
}
export function assertArc200Query(query: Arc200Query): void {
	assertArc200Bound(query.minRound);
	assertArc200Bound(query.maxRound);
	if (
		query.minRound > query.maxRound ||
		query.maxRound - query.minRound > BigInt(ARC200_MAX_ROUND_WINDOW)
	)
		throw new Error('Invalid ARC-200 round window.');
}
function contractId(value: unknown): bigint {
	if (typeof value !== 'string' || !/^\d+$/.test(value))
		throw new Error('ARC-200 contract ID must be decimal text.');
	const id = BigInt(value);
	assertArc200Bound(id);
	return id;
}
function nullableText(value: unknown): string {
	if (value === null) return '';
	if (typeof value !== 'string') throw new Error('Invalid ARC-200 text field.');
	return value;
}
export function normalizeArc200Page(
	value: unknown,
	query: Arc200Query,
	isValidAddress: (a: string) => boolean
): readonly Arc200Transfer[] {
	assertArc200Query(query);
	if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid ARC-200 page size.');
	let previousRound = query.maxRound;
	return value.map((raw) => {
		const row = object(raw);
		const id = contractId(row.contractid);
		if (typeof row.amount !== 'string' || !/^\d+$/.test(row.amount))
			throw new Error('ARC-200 amount must be exact decimal text.');
		const amount = BigInt(row.amount);
		if (amount >= 1n << 256n) throw new Error('ARC-200 amount exceeds uint256.');
		if (
			typeof row.from !== 'string' ||
			!isValidAddress(row.from) ||
			typeof row.to !== 'string' ||
			!isValidAddress(row.to)
		)
			throw new Error('Invalid ARC-200 transfer address.');
		if (row.from !== query.address && row.to !== query.address)
			throw new Error('ARC-200 transfer does not involve the queried account.');
		const round = BigInt(safeInteger(row.round, 1));
		if (round > previousRound || round < query.minRound)
			throw new Error('ARC-200 rounds are outside the window or not descending.');
		previousRound = round;
		const timestamp = safeInteger(row.timestamp, 0);
		if (!Number.isFinite(new Date(timestamp * 1000).getTime()))
			throw new Error('Invalid ARC-200 timestamp.');
		return {
			contractId: id,
			from: row.from,
			to: row.to,
			amount,
			round,
			timestamp,
			txId: nullableText(row.transactionid),
			note: nullableText(row.note)
		};
	});
}
export function normalizeArc200Metadata(value: unknown, expectedId: bigint): Arc200Metadata {
	assertArc200Bound(expectedId);
	const tokens = object(value).tokens;
	if (!Array.isArray(tokens) || tokens.length > 1)
		throw new Error('Invalid ARC-200 metadata envelope.');
	if (!tokens.length)
		return Object.freeze({ id: expectedId, decimals: null, unitName: '', name: '' });
	const token = object(tokens[0]);
	const id =
		typeof token.contractId === 'number'
			? BigInt(safeInteger(token.contractId, 1))
			: contractId(token.contractId);
	if (id !== expectedId) throw new Error('ARC-200 metadata ID does not match the request.');
	const decimals =
		typeof token.decimals === 'number' &&
		Number.isInteger(token.decimals) &&
		token.decimals >= 0 &&
		token.decimals <= 255
			? token.decimals
			: null;
	return Object.freeze({
		id,
		decimals,
		unitName: nullableText(token.symbol ?? null),
		name: nullableText(token.name ?? null)
	});
}
export function selectArc200Window(
	page: readonly Arc200Transfer[],
	upperRound: bigint
): Arc200Window {
	if (page.length < 100) return { kind: 'done', accepted: page };
	const round = page[page.length - 1].round;
	if (page.length > 100 || round > upperRound) throw new Error('Invalid ARC-200 window.');
	if (page[0].round === round) return { kind: 'cap', accepted: [], round };
	return {
		kind: 'next',
		accepted: page.filter((transfer) => transfer.round > round),
		upperRound: round
	};
}
export function mapArc200Transfer(
	transfer: Arc200Transfer,
	account: string,
	occurrence: number
): ExportRow {
	return {
		assetKind: 'arc200',
		assetId: transfer.contractId,
		applicationId: transfer.contractId,
		timestamp: transfer.timestamp,
		account,
		txId: transfer.txId,
		innerPath: '',
		group: '',
		transactionType: 'appl',
		type: 'asset-transfer',
		effect: 'amount',
		direction: transfer.from === transfer.to ? 'self' : transfer.from === account ? 'out' : 'in',
		from: transfer.from,
		to: transfer.to,
		amount: transfer.amount,
		fee: 0n,
		round: transfer.round,
		note: transfer.note,
		arc200Occurrence: occurrence
	};
}
