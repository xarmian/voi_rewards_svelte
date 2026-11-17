import { BLOCK_REWARD_NOTE_PREFIX, FEE_SINK_ADDRESS } from '$lib/rewards/blockRewardConstants';

export type ActivityType =
	| 'payment'
	| 'epoch-reward'
	| 'block-reward'
	| 'protocol-reward'
	| 'asset-transfer'
	| 'close-out'
	| 'fee'
	| 'nft-transfer';
export type ExportStatus =
	| 'complete-indexed'
	| 'partial-source'
	| 'partial-cap'
	| 'partial-cancelled'
	| 'partial-error';
export type AssetSelectionInput = { mode: 'native' | 'all' } | { mode: 'asset'; id: string };
export type AssetSelection = { mode: 'native' | 'all' } | { mode: 'asset'; id: bigint };
export interface AssetMetadata {
	readonly id: bigint;
	readonly decimals: number;
	readonly unitName: string;
	readonly name: string;
}
export interface ExportInput {
	assets: AssetSelectionInput;
	pageAddress: string;
	addresses: readonly string[];
	types: readonly ActivityType[];
	allDates?: boolean;
	from?: string;
	through?: string;
}
export interface ExportOptions extends Omit<ExportInput, 'assets'> {
	assets: AssetSelection;
	allDates: boolean;
	startTime?: number;
	endTime?: number;
}
export interface ExportQuery {
	address?: string;
	maxRound: bigint;
	limit: number;
	nextToken?: string;
	afterTime?: string;
	beforeTime?: string;
}
export interface TransactionNode {
	type: string;
	sender: string;
	fee: bigint;
	note: string;
	rewards: { sender: bigint; receiver: bigint; close: bigint };
	applicationId?: bigint;
	payment?: { receiver: string; amount: bigint; closeAmount: bigint; closeTo?: string };
	assetTransfer?: {
		assetId: bigint;
		sender?: string;
		receiver: string;
		amount: bigint;
		closeAmount: bigint;
		closeTo?: string;
	};
	inner: TransactionNode[];
}
export interface NormalizedTransaction extends TransactionNode {
	id: string;
	round: bigint;
	timestamp: number;
	offset?: number;
	group: string;
}
export interface ExportRow {
	assetKind: 'native' | 'asa' | 'arc200' | 'arc72';
	arc200Occurrence?: number;
	nftTokenId?: bigint;
	nftEvent?: 'mint' | 'burn' | 'transfer';
	assetId: bigint | null;
	timestamp: number;
	account: string;
	txId: string;
	innerPath: string;
	transactionType: string;
	type: ActivityType;
	effect: 'amount' | 'close' | 'fee' | 'reward';
	direction: 'in' | 'out' | 'self' | 'fee';
	from: string;
	to: string;
	amount: bigint;
	fee: bigint;
	round: bigint;
	offset?: number;
	group: string;
	applicationId?: bigint;
	note: string;
}
export class OptionsError extends Error {
	constructor(
		public field: 'dates' | 'accounts' | 'types' | 'assets',
		message: string
	) {
		super(message);
	}
}
const activityTypes: readonly ActivityType[] = [
	'payment',
	'epoch-reward',
	'block-reward',
	'protocol-reward',
	'asset-transfer',
	'close-out',
	'fee',
	'nft-transfer'
];
function dateTime(date: string | undefined): number {
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
		throw new OptionsError('dates', 'Enter both dates as YYYY-MM-DD.');
	const milliseconds = Date.parse(`${date}T00:00:00.000Z`);
	if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== date)
		throw new OptionsError('dates', 'Enter real calendar dates.');
	return milliseconds / 1000;
}
export function normalizeOptions(
	input: ExportInput,
	todayUtc: string,
	isValidAddress: (address: string) => boolean
): ExportOptions {
	const addresses = [...new Set(input.addresses.map((a) => a.trim()).filter(Boolean))];
	if (
		!isValidAddress(input.pageAddress) ||
		!addresses.length ||
		addresses.length > 10 ||
		addresses.some((a) => !isValidAddress(a))
	)
		throw new OptionsError('accounts', 'Select 1–10 valid account addresses.');
	addresses.sort((a, b) =>
		a === input.pageAddress ? -1 : b === input.pageAddress ? 1 : lexical(a, b)
	);
	const types = [...new Set(input.types)];
	if (!types.length || types.some((t) => !activityTypes.includes(t)))
		throw new OptionsError('types', 'Select at least one activity type.');
	let assets: AssetSelection;
	if (input.assets.mode === 'asset') {
		const id = input.assets.id.trim();
		if (!/^\d+$/.test(id) || BigInt(id) < 1n || BigInt(id) > 18446744073709551615n)
			throw new OptionsError('assets', 'Enter an asset ID from 1 to 18446744073709551615.');
		assets = { mode: 'asset', id: BigInt(id) };
	} else {
		assets = { mode: input.assets.mode };
	}
	const base = {
		assets: Object.freeze(assets),
		pageAddress: input.pageAddress,
		addresses: Object.freeze(addresses),
		types: Object.freeze(types),
		allDates: !!input.allDates
	};
	if (input.allDates) return Object.freeze(base);
	const startTime = dateTime(input.from);
	const throughTime = dateTime(input.through);
	if (startTime > throughTime || throughTime > dateTime(todayUtc))
		throw new OptionsError(
			'dates',
			'From must be on or before Through, and Through cannot be after today (UTC).'
		);
	return Object.freeze({
		...base,
		from: input.from,
		through: input.through,
		startTime,
		endTime: throughTime + 86400
	});
}
export function buildQuery(
	options: ExportOptions,
	address: string,
	snapshotRound: bigint,
	cursor?: string
): ExportQuery {
	return {
		address,
		maxRound: snapshotRound,
		limit: 500,
		...(cursor ? { nextToken: cursor } : {}),
		...(options.allDates
			? {}
			: {
					afterTime: new Date((options.startTime! - 1) * 1000).toISOString(),
					beforeTime: new Date(options.endTime! * 1000).toISOString()
				})
	};
}
export function formatUnits(value: bigint, decimals: number): string {
	if (typeof value !== 'bigint' || !Number.isInteger(decimals) || decimals < 0 || decimals > 255)
		throw new Error('Invalid exact amount or decimal scale.');
	const sign = value < 0n ? '-' : '';
	const digits = (value < 0n ? -value : value).toString();
	if (!decimals) return sign + digits;
	const padded = digits.padStart(decimals + 1, '0');
	const fraction = padded.slice(-decimals).replace(/0+$/, '');
	return sign + padded.slice(0, -decimals) + (fraction ? '.' + fraction : '');
}
export function mapTransaction(
	root: NormalizedTransaction,
	accounts: ReadonlySet<string>,
	rewardSenders: ReadonlySet<string>
): ExportRow[] {
	const rows: ExportRow[] = [];
	// round is a bigint after normalisation; String() renders a bigint or safe-integer number as plain digits.
	const blockRewardNote = BLOCK_REWARD_NOTE_PREFIX + String(root.round);
	function visit(node: TransactionNode, innerPath: string, parentApp?: bigint) {
		const applicationId = node.type === 'appl' ? node.applicationId : parentApp;
		const base = {
			assetKind: 'native' as const,
			assetId: null,
			timestamp: root.timestamp,
			txId: root.id,
			innerPath,
			transactionType: node.type,
			from: node.sender,
			round: root.round,
			offset: root.offset,
			group: root.group,
			applicationId,
			note: node.note
		};
		function transfer(
			from: string,
			to: string,
			amount: bigint,
			effect: 'amount' | 'close',
			assetId: bigint | null = null
		) {
			for (const account of new Set([from, to])) {
				if (!accounts.has(account)) continue;
				const direction = from === to ? 'self' : account === from ? 'out' : 'in';
				const type =
					effect === 'close'
						? 'close-out'
						: assetId !== null
							? 'asset-transfer'
							: direction === 'in' &&
								  from === FEE_SINK_ADDRESS &&
								  node.type === 'pay' &&
								  node.note === blockRewardNote
								? 'block-reward'
								: direction === 'in' && rewardSenders.has(from)
									? 'epoch-reward'
									: 'payment';
				rows.push({
					...base,
					assetKind: assetId === null ? 'native' : 'asa',
					assetId,
					from,
					account,
					effect,
					type,
					direction,
					to,
					amount,
					fee: 0n
				});
			}
		}
		if (node.type === 'pay' && node.payment) {
			transfer(node.sender, node.payment.receiver, node.payment.amount, 'amount');
			if (node.payment.closeAmount > 0n) {
				if (!node.payment.closeTo) throw new Error('Positive close amount requires a recipient.');
				transfer(node.sender, node.payment.closeTo, node.payment.closeAmount, 'close');
			}
		}
		if (node.type === 'axfer' && node.assetTransfer) {
			const asset = node.assetTransfer;
			const from = asset.sender ?? node.sender;
			transfer(from, asset.receiver, asset.amount, 'amount', asset.assetId);
			if (asset.closeAmount > 0n && !asset.closeTo)
				throw new Error('Positive close amount requires a recipient.');
			if (asset.closeTo) transfer(from, asset.closeTo, asset.closeAmount, 'close', asset.assetId);
		}
		if (node.fee > 0n && accounts.has(node.sender))
			rows.push({
				...base,
				account: node.sender,
				effect: 'fee',
				type: 'fee',
				direction: 'fee',
				to: '',
				amount: 0n,
				fee: node.fee
			});
		for (const [account, amount] of [
			[node.sender, node.rewards.sender],
			[node.payment?.receiver, node.rewards.receiver],
			[node.payment?.closeTo, node.rewards.close]
		] as const)
			if (amount > 0n && account !== undefined && accounts.has(account))
				rows.push({
					...base,
					account,
					effect: 'reward',
					type: 'protocol-reward',
					direction: 'in',
					from: '',
					to: account,
					amount,
					fee: 0n
				});
		node.inner.forEach((child, i) =>
			visit(child, innerPath ? `${innerPath}.${i}` : String(i), applicationId)
		);
	}
	visit(root, '');
	return rows;
}
export function matchesFilters(row: ExportRow, options: ExportOptions): boolean {
	return (
		options.types.includes(row.type) &&
		// The asset choice describes fungible assets; NFT rows have their own type control.
		(row.assetKind === 'arc72' ||
			(options.assets.mode === 'asset'
				? (row.assetKind === 'asa' && row.assetId === options.assets.id) ||
					(row.assetKind === 'native' && row.type === 'fee')
				: options.assets.mode === 'all' || row.assetKind === 'native')) &&
		(options.allDates || (row.timestamp >= options.startTime! && row.timestamp < options.endTime!))
	);
}
function lexical(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
function numeric(a: bigint | null | undefined, b: bigint | null | undefined): number {
	return (a ?? -1n) < (b ?? -1n) ? -1 : (a ?? -1n) > (b ?? -1n) ? 1 : 0;
}
const sourceRank = { native: 0, asa: 0, arc200: 1, arc72: 2 };
export function compareRows(a: ExportRow, b: ExportRow): number {
	if (a.round !== b.round) return a.round < b.round ? -1 : 1;
	const rank = sourceRank[a.assetKind] - sourceRank[b.assetKind];
	if (rank) return rank;
	if (a.assetKind === 'arc200')
		return lexical(a.account, b.account) || b.arc200Occurrence! - a.arc200Occurrence!;
	// The NFT source has no intra-round order, so ties sort by content.
	if (a.assetKind === 'arc72')
		return (
			lexical(a.account, b.account) ||
			lexical(a.txId, b.txId) ||
			numeric(a.assetId, b.assetId) ||
			numeric(a.nftTokenId, b.nftTokenId) ||
			lexical(a.from, b.from) ||
			lexical(a.to, b.to)
		);
	const offset =
		Number(a.offset === undefined) - Number(b.offset === undefined) ||
		(a.offset ?? 0) - (b.offset ?? 0);
	if (offset) return offset;
	const id = lexical(a.txId, b.txId);
	if (id) return id;
	const ap = a.innerPath ? a.innerPath.split('.').map(Number) : [];
	const bp = b.innerPath ? b.innerPath.split('.').map(Number) : [];
	for (let i = 0; i < Math.min(ap.length, bp.length); i++)
		if (ap[i] !== bp[i]) return ap[i] - bp[i];
	const order = { amount: 0, close: 1, fee: 2, reward: 3 };
	return (
		ap.length - bp.length || order[a.effect] - order[b.effect] || lexical(a.account, b.account)
	);
}
