import { isValidAddress, ALGORAND_ZERO_ADDRESS_STRING, parseJSON, IntDecoding } from 'algosdk';
import { algodIndexer } from '$lib/utils/algod';
import {
	buildQuery,
	compareRows,
	mapTransaction,
	matchesFilters,
	type AssetMetadata,
	type ExportOptions,
	type ExportQuery,
	type ExportRow,
	type ExportStatus,
	type NormalizedTransaction,
	type TransactionNode
} from '$lib/wallet/transactionExport';

export { isValidAddress };
class SchemaError extends Error {}
class CursorError extends SchemaError {}
class DeadlineError extends Error {}
class AssetMetadataError extends Error {
	constructor(id: bigint) {
		super(
			`Asset ${id} metadata unavailable; this page was not included. Amounts were not guessed.`
		);
	}
}
function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new SchemaError('Invalid indexed transaction structure.');
	return value as Record<string, unknown>;
}
function exact(value: unknown): bigint {
	if (typeof value === 'bigint' && value >= 0n) return value;
	if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
	throw new SchemaError('Expected an exact nonnegative integer from the indexer.');
}
function positive(value: unknown): bigint {
	const result = exact(value);
	if (!result) throw new SchemaError('Expected a positive indexed round.');
	return result;
}
function text(value: unknown): string {
	if (typeof value !== 'string' || !value)
		throw new SchemaError('Missing indexed transaction identity or address.');
	return value;
}
function assetId(value: unknown): bigint {
	const id = positive(value);
	if (id > 18446744073709551615n) throw new SchemaError('Invalid uint64 asset ID.');
	return id;
}
function address(value: unknown): string {
	const result = text(value);
	if (!isValidAddress(result)) throw new SchemaError('Invalid indexed asset address.');
	return result;
}
function optionalAddress(value: unknown): string | undefined {
	return value === undefined || value === ALGORAND_ZERO_ADDRESS_STRING ? undefined : address(value);
}
function safeNumber(value: unknown): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
		throw new SchemaError('Invalid indexed timestamp or offset.');
	return value;
}
function bytes(value: unknown): Uint8Array {
	if (!(value instanceof Uint8Array)) throw new SchemaError('Invalid indexed byte field.');
	return value;
}
function base64(value: Uint8Array): string {
	let binary = '';
	for (const byte of value) binary += String.fromCharCode(byte);
	return btoa(binary);
}
function note(value: unknown): string {
	if (value === undefined) return '';
	const data = bytes(value);
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(data);
	} catch {
		return 'base64:' + base64(data);
	}
}
function normalizeNode(value: unknown, ancestors: Set<unknown>): TransactionNode {
	const tx = object(value);
	if (ancestors.has(value)) throw new SchemaError('Cyclic inner transaction tree.');
	ancestors.add(value);
	const type = text(tx.txType);
	const result: TransactionNode = {
		type,
		sender: text(tx.sender),
		fee: exact(tx.fee),
		note: note(tx.note),
		inner: []
	};
	if (type === 'pay') {
		const pay = object(tx.paymentTransaction);
		const closeAmount = exact(pay.closeAmount ?? tx.closingAmount ?? 0n);
		if (
			pay.closeAmount !== undefined &&
			tx.closingAmount !== undefined &&
			closeAmount !== exact(tx.closingAmount)
		)
			throw new SchemaError('Conflicting indexed close amounts.');
		const closeTo = pay.closeRemainderTo === undefined ? undefined : text(pay.closeRemainderTo);
		if (closeAmount > 0n && !closeTo)
			throw new SchemaError('Positive close amount has no recipient.');
		result.payment = {
			receiver: text(pay.receiver),
			amount: exact(pay.amount),
			closeAmount,
			closeTo
		};
	}
	if (type === 'axfer') {
		const asset = object(tx.assetTransferTransaction);
		const closeAmount = exact(asset.closeAmount === undefined ? 0n : asset.closeAmount);
		const closeTo = optionalAddress(asset.closeTo);
		if (closeAmount > 0n && !closeTo)
			throw new SchemaError('Positive close amount has no recipient.');
		result.sender = address(tx.sender);
		result.assetTransfer = {
			assetId: assetId(asset.assetId),
			sender: optionalAddress(asset.sender),
			receiver: address(asset.receiver),
			amount: exact(asset.amount),
			closeAmount,
			closeTo
		};
	}
	if (type === 'appl') {
		const app = object(tx.applicationTransaction);
		const id = exact(app.applicationId);
		result.applicationId =
			id ||
			(tx.createdApplicationIndex === undefined
				? undefined
				: exact(tx.createdApplicationIndex) || undefined);
	}
	if (tx.innerTxns !== undefined) {
		if (!Array.isArray(tx.innerTxns)) throw new SchemaError('Invalid inner transaction array.');
		result.inner = tx.innerTxns.map((child) => normalizeNode(child, ancestors));
	}
	ancestors.delete(value);
	return result;
}
export function normalizeTransaction(value: unknown): NormalizedTransaction {
	const tx = object(value);
	const timestamp = safeNumber(tx.roundTime);
	if (!Number.isFinite(new Date(timestamp * 1000).getTime()))
		throw new SchemaError('Invalid confirmed transaction time.');
	return {
		...normalizeNode(value, new Set()),
		id: text(tx.id),
		round: positive(tx.confirmedRound),
		timestamp,
		offset: tx.intraRoundOffset === undefined ? undefined : safeNumber(tx.intraRoundOffset),
		group: tx.group === undefined ? '' : base64(bytes(tx.group))
	};
}
function assetText(params: Record<string, unknown>, key: string): string {
	const plain = params[key];
	const encoded = params[`${key}-b64`];
	if (plain !== undefined && typeof plain !== 'string')
		throw new SchemaError('Invalid indexed asset text.');
	let data: Uint8Array | undefined;
	if (encoded !== undefined) {
		if (typeof encoded !== 'string') throw new SchemaError('Invalid indexed asset text bytes.');
		try {
			const binary = atob(encoded);
			if (btoa(binary) !== encoded) throw new Error('Noncanonical base64.');
			data = Uint8Array.from(binary, (character) => character.charCodeAt(0));
		} catch {
			throw new SchemaError('Invalid indexed asset text bytes.');
		}
	}
	if (typeof plain === 'string') return plain;
	if (!data) return '';
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(data);
	} catch {
		return `base64:${encoded}`;
	}
}
export function normalizeAssetResponse(value: unknown, expectedId: bigint): AssetMetadata {
	const asset = object(object(value).asset);
	if (typeof asset.index !== 'bigint' || assetId(asset.index) !== expectedId)
		throw new SchemaError('Indexed asset ID does not match the request.');
	const params = object(asset.params);
	if (typeof params.decimals !== 'bigint' || params.decimals < 0n || params.decimals > 19n)
		throw new SchemaError('Missing or invalid indexed asset decimals.');
	return Object.freeze({
		id: asset.index,
		decimals: Number(params.decimals),
		unitName: assetText(params, 'unit-name'),
		name: assetText(params, 'name')
	});
}
export interface ExportPage {
	transactions: unknown[];
	nextToken?: string;
}
interface SearchBuilder {
	excludeCloseTo(value: boolean): SearchBuilder;
	address(value: string): SearchBuilder;
	limit(value: number): SearchBuilder;
	maxRound(value: bigint): SearchBuilder;
	afterTime(value: string): SearchBuilder;
	beforeTime(value: string): SearchBuilder;
	nextToken(value: string): SearchBuilder;
	do(headers?: Record<string, string>, customOptions?: Record<string, unknown>): Promise<unknown>;
}
interface AssetLookup {
	includeAll(value: boolean): AssetLookup;
	doRaw(
		headers?: Record<string, string>,
		customOptions?: Record<string, unknown>
	): Promise<Uint8Array>;
}
export function createIndexerReader(
	client: {
		searchForTransactions(): SearchBuilder;
		lookupAssetByID(id: bigint): AssetLookup;
	} = algodIndexer
) {
	return {
		async bootstrap(address: string, signal: AbortSignal): Promise<bigint> {
			const response = object(
				await client.searchForTransactions().address(address).limit(1).do(undefined, { signal })
			);
			return positive(response.currentRound);
		},
		async readPage(query: ExportQuery, signal: AbortSignal): Promise<ExportPage> {
			let request = client
				.searchForTransactions()
				.address(query.address)
				.excludeCloseTo(false)
				.maxRound(query.maxRound)
				.limit(query.limit);
			if (query.afterTime) request = request.afterTime(query.afterTime);
			if (query.beforeTime) request = request.beforeTime(query.beforeTime);
			if (query.nextToken) request = request.nextToken(query.nextToken);
			const response = object(await request.do(undefined, { signal }));
			return validatePage(response);
		},
		async readAsset(id: bigint, signal: AbortSignal): Promise<unknown> {
			const raw = await client.lookupAssetByID(id).includeAll(true).doRaw(undefined, { signal });
			try {
				return parseJSON(new TextDecoder('utf-8', { fatal: true }).decode(raw), {
					intDecoding: IntDecoding.BIGINT
				});
			} catch {
				throw new SchemaError('Invalid indexed asset response.');
			}
		}
	};
}
function validatePage(value: unknown): ExportPage {
	const page = object(value);
	if (!Array.isArray(page.transactions) || page.transactions.length > 500)
		throw new SchemaError('Invalid indexer page or page size.');
	if (page.nextToken !== undefined && (typeof page.nextToken !== 'string' || !page.nextToken))
		throw new SchemaError('Invalid indexer cursor.');
	return { transactions: page.transactions, nextToken: page.nextToken as string | undefined };
}
export interface ExportResult {
	stakingContracts: ReadonlyMap<string, string>;
	assets: ReadonlyMap<bigint, AssetMetadata>;
	rows: readonly ExportRow[];
	snapshotRound: bigint;
	status: ExportStatus;
	reason: string;
	pages: number;
	scanned: number;
	completedAddresses: string[];
	unfinishedAddresses: string[];
	cursor?: string;
	canRetry: boolean;
	oldestTimestamp?: number;
	newestTimestamp?: number;
}
export interface ExportProgress {
	assetsResolved: number;
	resolvingAssetId?: bigint;
	account: number;
	accounts: number;
	pages: number;
	scanned: number;
	rows: number;
	retrySeconds?: number;
}
export interface ExportDependencies {
	stakingContracts?: ReadonlyMap<string, string>;
	readAsset(id: bigint, signal: AbortSignal): Promise<unknown>;
	maxAssets?: number;
	bootstrap(address: string, signal: AbortSignal): Promise<bigint>;
	readPage(query: ExportQuery, signal: AbortSignal): Promise<ExportPage>;
	rewardSenders: ReadonlySet<string>;
	now?: () => number;
	sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
	onProgress?: (progress: ExportProgress) => void;
	maxPages?: number;
	maxRows?: number;
}
export interface ExportRun {
	start(): Promise<ExportResult>;
	retry(): Promise<ExportResult>;
	cancel(): void;
	dispose(): void;
}
function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const abort = () => {
			clearTimeout(timer);
			signal.removeEventListener('abort', abort);
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', abort);
			resolve();
		}, ms);
		signal.addEventListener('abort', abort, { once: true });
		if (signal.aborted) abort();
	});
}
function httpDetails(error: unknown): { status?: number; retryAfter?: string } {
	if (!error || typeof error !== 'object') return {};
	const response = (
		error as { response?: { status?: number; headers?: Headers | Record<string, string> } }
	).response;
	const headers = response?.headers;
	return {
		status: response?.status,
		retryAfter:
			headers instanceof Headers
				? (headers.get('Retry-After') ?? undefined)
				: (headers?.['retry-after'] ?? headers?.['Retry-After'])
	};
}
export function createExportRun(options: ExportOptions, deps: ExportDependencies): ExportRun {
	const accounts = new Set(options.addresses);
	const rewards = new Set(deps.rewardSenders);
	const stakingContracts = new Map(deps.stakingContracts);
	const now = deps.now ?? Date.now;
	const pause = deps.sleep ?? sleep;
	const maxPages = deps.maxPages ?? 200;
	const maxRows = deps.maxRows ?? 100000;
	const maxAssets = deps.maxAssets ?? 200;
	const assets = new Map<bigint, AssetMetadata>();
	let resolvingAssetId: bigint | undefined;
	let rows: ExportRow[] = [];
	const roots = new Map<string, string>();
	const cursors = new Set<string>();
	let accountIndex = 0,
		pages = 0,
		scanned = 0;
	let snapshotRound = 0n;
	let cursor: string | undefined;
	let status: ExportStatus = 'partial-error';
	let reason = '';
	let retryEligible = false;
	let started = false,
		disposed = false,
		cancelled = false;
	let active: Promise<ExportResult> | undefined;
	let pendingRead: Promise<unknown> | undefined;
	let lastStart = -Infinity;
	let controller = new AbortController();
	let oldestTimestamp: number | undefined, newestTimestamp: number | undefined;
	function progress(retrySeconds?: number) {
		if (!disposed && !cancelled)
			deps.onProgress?.({
				assetsResolved: assets.size,
				resolvingAssetId,
				account: Math.min(accountIndex + 1, accounts.size),
				accounts: accounts.size,
				pages,
				scanned,
				rows: rows.length,
				retrySeconds
			});
	}
	function result(): ExportResult {
		return {
			assets: new Map(assets),
			stakingContracts: new Map(stakingContracts),
			rows: [...rows].sort(compareRows),
			snapshotRound,
			status,
			reason,
			pages,
			scanned,
			completedAddresses: options.addresses.slice(0, accountIndex),
			unfinishedAddresses: options.addresses.slice(accountIndex),
			cursor,
			canRetry: retryEligible && !disposed && !cancelled,
			oldestTimestamp,
			newestTimestamp
		};
	}
	async function wait(ms: number, countdown = false) {
		let remaining = ms;
		while (remaining > 0) {
			controller.signal.throwIfAborted();
			if (countdown) progress(Math.ceil(remaining / 1000));
			const step = countdown ? Math.min(remaining, 1000) : remaining;
			await pause(step, controller.signal);
			remaining -= step;
		}
		controller.signal.throwIfAborted();
	}
	async function request<T>(read: (signal: AbortSignal) => Promise<T>): Promise<T> {
		// A deadline can win the race before the transport acknowledges its abort.
		if (pendingRead) {
			const signal = controller.signal;
			signal.throwIfAborted();
			await new Promise<void>((resolve, reject) => {
				const abort = () => {
					signal.removeEventListener('abort', abort);
					reject(signal.reason);
				};
				const settled = () => {
					signal.removeEventListener('abort', abort);
					resolve();
				};
				signal.addEventListener('abort', abort, { once: true });
				void pendingRead!.then(settled, settled);
			});
		}
		for (let attempt = 0; ; attempt++) {
			await wait(Math.max(0, lastStart + 500 - now()));
			controller.signal.throwIfAborted();
			lastStart = now();
			const requestController = new AbortController();
			let timer: ReturnType<typeof setTimeout> | undefined;
			let rejectAbort: (reason: unknown) => void = () => {};
			const abort = () => {
				requestController.abort(controller.signal.reason);
				rejectAbort(controller.signal.reason);
			};
			const interrupted = new Promise<never>((_resolve, reject) => {
				rejectAbort = reject;
				timer = setTimeout(() => {
					const error = new DeadlineError('The indexer page exceeded the 30-second deadline.');
					requestController.abort(error);
					reject(error);
				}, 30000);
			});
			controller.signal.addEventListener('abort', abort, { once: true });
			try {
				const pending = Promise.resolve()
					.then(() => {
						requestController.signal.throwIfAborted();
						return read(requestController.signal);
					})
					.finally(() => {
						pendingRead = undefined;
					});
				pendingRead = pending;
				const value = await Promise.race([pending, interrupted]);
				controller.signal.throwIfAborted();
				return value;
			} catch (error) {
				controller.signal.throwIfAborted();
				const { status: httpStatus, retryAfter } = httpDetails(error);
				const transient =
					!(error instanceof SchemaError || error instanceof DeadlineError) &&
					(httpStatus === undefined || httpStatus === 429 || httpStatus >= 500);
				if (!transient || attempt >= 3) throw error;
				let delay = 1000 * 2 ** attempt;
				if (retryAfter) {
					const seconds = /^\d+(\.\d+)?$/.test(retryAfter)
						? Number(retryAfter) * 1000
						: Date.parse(retryAfter) - now();
					if (Number.isFinite(seconds)) delay = Math.max(delay, seconds);
				}
				// The failed request has settled before any retry is scheduled.
				clearTimeout(timer);
				controller.signal.removeEventListener('abort', abort);
				await wait(delay, true);
			} finally {
				clearTimeout(timer);
				controller.signal.removeEventListener('abort', abort);
			}
		}
	}
	async function execute(): Promise<ExportResult> {
		retryEligible = false;
		try {
			progress();
			if (!snapshotRound)
				snapshotRound = positive(
					await request((signal) => deps.bootstrap(options.addresses[0], signal))
				);
			while (accountIndex < options.addresses.length) {
				controller.signal.throwIfAborted();
				if (pages >= maxPages || rows.length >= maxRows) {
					status = 'partial-cap';
					reason = 'Export cap reached; narrow the dates or select fewer accounts.';
					return result();
				}
				const query = buildQuery(options, options.addresses[accountIndex], snapshotRound, cursor);
				const page = validatePage(await request((signal) => deps.readPage(query, signal)));
				if (page.nextToken && cursors.has(page.nextToken))
					throw new CursorError('The indexer repeated a cursor. Start again.');
				const stagedRoots = new Map<string, string>();
				const stagedRows: ExportRow[] = [];
				for (const raw of page.transactions) {
					const root = normalizeTransaction(raw);
					if (root.round > snapshotRound)
						throw new SchemaError('Indexer returned a transaction beyond the snapshot round.');
					const fingerprint = JSON.stringify(root, (_key, value) =>
						typeof value === 'bigint' ? value.toString() : value
					);
					const prior = stagedRoots.get(root.id) ?? roots.get(root.id);
					if (prior !== undefined) {
						if (prior !== fingerprint)
							throw new SchemaError('Conflicting copies of an indexed transaction.');
						continue;
					}
					stagedRoots.set(root.id, fingerprint);
					stagedRows.push(
						...mapTransaction(root, accounts, rewards).filter((row) => matchesFilters(row, options))
					);
				}
				if (rows.length + stagedRows.length > maxRows) {
					status = 'partial-cap';
					reason =
						'The next page exceeds the row cap; none of that page was retained. Narrow the dates.';
					return result();
				}
				const needed = new Set(
					stagedRows.flatMap((row) => (row.assetId === null ? [] : [row.assetId]))
				);
				if (new Set([...assets.keys(), ...needed]).size > maxAssets) {
					status = 'partial-cap';
					reason = 'Asset limit reached; select one asset or narrow the dates.';
					return result();
				}
				for (const id of needed) {
					if (assets.has(id)) continue;
					resolvingAssetId = id;
					progress();
					try {
						const raw = await request((signal) => deps.readAsset(id, signal));
						controller.signal.throwIfAborted();
						assets.set(id, normalizeAssetResponse(raw, id));
					} catch {
						throw new AssetMetadataError(id);
					} finally {
						resolvingAssetId = undefined;
						progress();
					}
				}
				controller.signal.throwIfAborted();
				for (const [id, fingerprint] of stagedRoots) roots.set(id, fingerprint);
				rows.push(...stagedRows);
				for (const row of stagedRows) {
					oldestTimestamp = Math.min(oldestTimestamp ?? row.timestamp, row.timestamp);
					newestTimestamp = Math.max(newestTimestamp ?? row.timestamp, row.timestamp);
				}
				pages++;
				scanned += page.transactions.length;
				cursor = page.nextToken;
				if (cursor) cursors.add(cursor);
				else {
					accountIndex++;
					cursors.clear();
				}
				progress();
			}
			status = 'complete-indexed';
			reason = '';
		} catch (error) {
			if (cancelled || disposed) {
				status = 'partial-cancelled';
				reason = 'Cancelled.';
			} else {
				status = 'partial-error';
				const httpStatus = httpDetails(error).status;
				const invalidCursor =
					error instanceof CursorError ||
					(!!cursor && (httpStatus === 400 || httpStatus === 404 || httpStatus === 410));
				retryEligible = !invalidCursor;
				reason = invalidCursor
					? 'The indexer cursor is invalid or expired. Start again.'
					: error instanceof Error
						? error.message
						: 'Indexer read failed.';
			}
		}
		return result();
	}
	function launch(): Promise<ExportResult> {
		if (active) return active;
		active = execute().finally(() => {
			active = undefined;
		});
		return active;
	}
	function cancel() {
		cancelled = true;
		retryEligible = false;
		status = 'partial-cancelled';
		reason = 'Cancelled.';
		controller.abort(new Error('Cancelled.'));
	}
	return {
		start() {
			if (started || disposed) return active ?? Promise.resolve(result());
			started = true;
			return launch();
		},
		retry() {
			if (active) return active;
			if (!result().canRetry) return Promise.resolve(result());
			controller = new AbortController();
			return launch();
		},
		cancel,
		dispose() {
			disposed = true;
			cancel();
			rows = [];
			roots.clear();
			assets.clear();
			cursors.clear();
		}
	};
}
