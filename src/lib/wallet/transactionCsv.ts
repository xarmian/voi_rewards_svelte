import type { Arc200Metadata } from './arc200Export';
import {
	compareRows,
	formatUnits,
	type AssetMetadata,
	type ExportOptions,
	type ExportRow,
	type ExportStatus
} from './transactionExport';

const columns = [
	'Timestamp (UTC)',
	'Account',
	'Tx ID',
	'Inner path',
	'Transaction type',
	'Type',
	'Direction',
	'From',
	'To',
	'Asset',
	'Amount',
	'Fee (VOI)',
	'Round',
	'Group ID',
	'Application ID',
	'Note',
	'Snapshot round',
	'Export status',
	'Asset ID',
	'Asset unit',
	'Asset name',
	'Asset decimals',
	'Staking contract'
];
export function protectText(value: string): string {
	let first = '';
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code > 32 && !(code >= 127 && code <= 159) && !/\s/u.test(character)) {
			first = character;
			break;
		}
	}
	return (first && '=+-@'.includes(first)) || /^[^\S\t\r\n]*[\t\r\n]/u.test(value)
		? "'" + value
		: value;
}
export function csvCell(value: string): string {
	return '"' + value.replace(/"/g, '""') + '"';
}
function numeric(value: bigint, decimals = 0): string {
	if (typeof value !== 'bigint' || value < 0n)
		throw new Error('CSV numeric values must be exact nonnegative integers.');
	return formatUnits(value, decimals);
}
interface Context {
	arc200Assets: ReadonlyMap<bigint, Arc200Metadata>;
	stakingContracts: ReadonlyMap<string, string>;
	assets: ReadonlyMap<bigint, AssetMetadata>;
	snapshotRound: bigint;
	status: ExportStatus;
}
export function serializeCsv(rows: readonly ExportRow[], context: Context): string {
	const snapshotRound = numeric(context.snapshotRound);
	const records = [...rows].sort(compareRows).map((row) => {
		const arc = row.assetKind === 'arc200';
		const metadata =
			row.assetId === null
				? undefined
				: (arc ? context.arc200Assets : context.assets).get(row.assetId);
		if (
			row.assetId !== null &&
			(typeof row.assetId !== 'bigint' ||
				row.assetId < 1n ||
				row.assetId > 18446744073709551615n ||
				!metadata ||
				metadata.id !== row.assetId ||
				(!(arc && metadata.decimals === null) &&
					(typeof metadata.decimals !== 'number' ||
						!Number.isInteger(metadata.decimals) ||
						metadata.decimals < 0 ||
						metadata.decimals > (arc ? 255 : 19))) ||
				typeof metadata.unitName !== 'string' ||
				typeof metadata.name !== 'string')
		)
			throw new Error(`Asset ${row.assetId} metadata is missing or invalid.`);
		const stakingIds = [
			...new Set(
				[row.from, row.to].flatMap((address) => {
					const id = context.stakingContracts.get(address);
					return id === undefined ? [] : [BigInt(id)];
				})
			)
		].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
		return [
			protectText(new Date(row.timestamp * 1000).toISOString()),
			protectText(row.account),
			protectText(row.txId),
			protectText(row.innerPath),
			protectText(row.transactionType),
			protectText(row.type),
			protectText(row.direction),
			protectText(row.from),
			protectText(row.to),
			arc
				? metadata?.decimals === null
					? 'ARC-200 (raw units)'
					: 'ARC-200'
				: metadata
					? 'ASA/VSA'
					: 'VOI',
			numeric(row.amount, metadata?.decimals ?? (arc ? 0 : 6)),
			numeric(row.fee, 6),
			numeric(row.round),
			protectText(row.group),
			row.applicationId === undefined ? '' : numeric(row.applicationId),
			protectText(row.note),
			snapshotRound,
			context.status,
			row.assetId === null ? '' : numeric(row.assetId),
			protectText(metadata?.unitName ?? 'VOI'),
			protectText(metadata?.name ?? 'VOI (native)'),
			arc && metadata?.decimals === null ? '' : String(metadata?.decimals ?? 6),
			stakingIds.map((id) => numeric(id)).join(' ')
		];
	});
	return [columns, ...records].map((record) => record.map(csvCell).join(',') + '\r\n').join('');
}
export function exportFilename(
	options: ExportOptions,
	context: Context & { pageAddress: string }
): string {
	const range = options.allDates ? 'all-dates' : `${options.from}_to_${options.through}`;
	if (
		!/^[A-Z2-7]+$/.test(context.pageAddress) ||
		!/^(all-dates|\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2})$/.test(range)
	)
		throw new Error('Invalid filename parameters.');
	const prefix =
		options.assets.mode === 'asset'
			? `voi-asset-${numeric(options.assets.id)}-activity`
			: options.assets.mode === 'all'
				? 'voi-all-assets-activity'
				: 'voi-native-only-activity';
	return `${prefix}-${context.pageAddress.slice(0, 8)}-${range}-${options.addresses.length}accounts-r${numeric(context.snapshotRound)}${context.status === 'complete-indexed' ? '' : '-partial'}.csv`;
}
