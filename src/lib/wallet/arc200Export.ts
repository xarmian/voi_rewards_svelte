import type { ExportRow } from './transactionExport';
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
export function normalizeArc200Page(
	_value: unknown,
	_query: Arc200Query,
	_isValidAddress: (a: string) => boolean
): readonly Arc200Transfer[] {
	throw new Error('ARC-200 page normalization is not implemented.');
}
export function normalizeArc200Metadata(_value: unknown, _expectedId: bigint): Arc200Metadata {
	throw new Error('ARC-200 metadata normalization is not implemented.');
}
export function selectArc200Window(
	_page: readonly Arc200Transfer[],
	_upperRound: bigint
): Arc200Window {
	throw new Error('ARC-200 window selection is not implemented.');
}
export function mapArc200Transfer(
	_transfer: Arc200Transfer,
	_account: string,
	_occurrence: number
): ExportRow {
	throw new Error('ARC-200 row mapping is not implemented.');
}
