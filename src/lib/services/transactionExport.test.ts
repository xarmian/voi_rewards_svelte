import { ALGORAND_ZERO_ADDRESS_STRING, encodeAddress } from 'algosdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createExportRun,
	normalizeTransaction,
	normalizeAssetResponse,
	createIndexerReader,
	type ExportDependencies,
	type ExportPage
} from './transactionExport';
import {
	mapTransaction,
	normalizeOptions,
	type ExportInput,
	type ExportQuery
} from '../wallet/transactionExport';
import { BLOCK_REWARD_NOTE_PREFIX, FEE_SINK_ADDRESS } from '../rewards/blockRewardConstants';
import { ARC72_CAP_WARNING, ARC72_SOURCE_NOTE, type Arc72Query } from '../wallet/arc72Export';

const raw = (id = 'ROOT', changes: Record<string, unknown> = {}) => ({
	id,
	confirmedRound: 10n,
	roundTime: 1704067200,
	sender: 'A',
	fee: 1n,
	txType: 'pay',
	paymentTransaction: { receiver: 'B', amount: 4n },
	...changes
});
const opts = (changes: Partial<ExportInput> = {}) =>
	normalizeOptions(
		{
			assets: { mode: 'native' },
			pageAddress: 'A',
			addresses: ['A'],
			allDates: true,
			types: [
				'payment',
				'epoch-reward',
				'block-reward',
				'protocol-reward',
				'asset-transfer',
				'close-out',
				'fee'
			],
			...changes
		},
		'2024-12-31',
		() => true
	);
function setup(
	pages: (ExportPage | Error)[],
	changes: Partial<ExportDependencies> = {},
	input: Partial<ExportInput> = {}
) {
	let clock = 0;
	const readPage = vi.fn(async (query: ExportQuery) => {
		if (!query.address) return { transactions: [] };
		const page = pages.shift();
		if (page instanceof Error) throw page;
		if (!page) throw new Error('Unexpected read');
		return page;
	});
	const deps: ExportDependencies = {
		bootstrap: vi.fn(async () => 100n),
		readPage,
		readArc200Page: vi.fn(async () => []),
		readArc72Page: vi.fn(async () => nftPage([])),
		readArc200Metadata: vi.fn(async (id) => arcMetadata(id)),
		readAsset: vi.fn(async (id) => metadata(id)),
		rewardSenders: new Set(),
		now: () => clock,
		sleep: async (ms) => {
			clock += ms;
		},
		...changes
	};
	return { run: createExportRun(opts(input), deps), readPage, deps };
}
const page = (id: string, nextToken?: string): ExportPage => ({
	transactions: [raw(id)],
	nextToken
});
const httpError = (status: number, retryAfter?: string) =>
	Object.assign(new Error('Read failed'), {
		response: { status, headers: new Headers(retryAfter ? { 'Retry-After': retryAfter } : {}) }
	});
afterEach(() => vi.useRealTimers());

const LEGACY_SENDER = 'H7W63MIQJMYBOEYPM5NJEGX3P54H54RZIV2G3OQ2255AULG6U74BE5KFC4';
const LEGACY_RECEIVER = 'ARAMIDFJYV2TOFB5MRNZJIXBSAVZCVAUDAPFGKR5PNX4MTILGAZABBTXQQ';
const legacyRewardTx = () =>
	raw('KO34YPCDK4WOQCYK7MXHFULLVPUO5Q2NSEFM3CVHNSMWUTFAQA4A', {
		confirmedRound: 8325339n,
		sender: LEGACY_SENDER,
		fee: 1000n,
		paymentTransaction: { receiver: LEGACY_RECEIVER, amount: 1000000n },
		senderRewards: 407n,
		receiverRewards: 44048243n,
		closeRewards: 0n
	});
describe('legacy protocol reward fields', () => {
	it('reads sender, receiver and close rewards from the applying transaction', () => {
		expect(normalizeTransaction(legacyRewardTx()).rewards).toEqual({
			sender: 407n,
			receiver: 44048243n,
			close: 0n
		});
	});
	it('treats absent reward fields as zero', () => {
		expect(normalizeTransaction(raw('ROOT')).rewards).toEqual({
			sender: 0n,
			receiver: 0n,
			close: 0n
		});
	});
	it('reads reward fields on inner transactions', () => {
		const tx = normalizeTransaction(
			raw('ROOT', {
				txType: 'appl',
				paymentTransaction: undefined,
				applicationTransaction: { applicationId: 9n },
				innerTxns: [
					{
						...raw('CHILD'),
						senderRewards: '5',
						receiverRewards: 6n,
						closeRewards: 7n,
						paymentTransaction: { receiver: 'B', amount: 1n, closeRemainderTo: 'C' }
					}
				]
			})
		);
		expect(tx.rewards).toEqual({ sender: 0n, receiver: 0n, close: 0n });
		expect(tx.inner[0].rewards).toEqual({ sender: 5n, receiver: 6n, close: 7n });
	});
	it('rejects receiver or close rewards on a non-payment transaction', () => {
		for (const changes of [{ receiverRewards: 1n }, { closeRewards: 1n }])
			expect(() => normalizeTransaction({ ...assetTx('ROOT', 1n), ...changes })).toThrow(
				'Rewards on a non-payment transaction.'
			);
		expect(normalizeTransaction({ ...assetTx('ROOT', 1n), senderRewards: 3n }).rewards).toEqual({
			sender: 3n,
			receiver: 0n,
			close: 0n
		});
	});
	it('rejects close rewards with no close recipient', () => {
		expect(() => normalizeTransaction(raw('ROOT', { closeRewards: 1n }))).toThrow(
			'Close rewards have no recipient.'
		);
	});
	it('rejects inexact reward values', () => {
		for (const changes of [{ senderRewards: 1 }, { receiverRewards: -1n }, { closeRewards: '1.5' }])
			expect(() => normalizeTransaction(raw('ROOT', changes))).toThrow();
	});
	it('maps the applying transaction to a protocol-reward row for each selected account', () => {
		const tx = normalizeTransaction(legacyRewardTx());
		expect(
			mapTransaction(tx, new Set([LEGACY_RECEIVER]), new Set()).map((r) => [
				r.account,
				r.type,
				r.direction,
				r.amount
			])
		).toEqual([
			[LEGACY_RECEIVER, 'payment', 'in', 1000000n],
			[LEGACY_RECEIVER, 'protocol-reward', 'in', 44048243n]
		]);
	});
});

describe('SDK boundary', () => {
	it('rejects unsafe numeric amounts, missing root identity/time, malformed recursion and close recipients', () => {
		for (const changes of [
			{ fee: Number.MAX_SAFE_INTEGER + 1 },
			{ id: undefined },
			{ roundTime: undefined },
			{ innerTxns: {} },
			{ paymentTransaction: { receiver: 'B', amount: '1', closeAmount: '2' } },
			{ paymentTransaction: undefined }
		])
			expect(() => normalizeTransaction(raw('ROOT', changes))).toThrow();
		expect(
			normalizeTransaction(raw('ROOT', { fee: '9007199254740993', note: new Uint8Array([255]) }))
		).toMatchObject({ fee: 9007199254740993n, note: 'base64:/w==' });
	});
	it('classifies an indexer block reward with a byte note as a block reward', () => {
		const reward = (note: Uint8Array) =>
			mapTransaction(
				normalizeTransaction(raw('ROOT', { sender: FEE_SINK_ADDRESS, fee: 0n, note })),
				new Set(['B']),
				new Set()
			)[0].type;
		expect(reward(new TextEncoder().encode(BLOCK_REWARD_NOTE_PREFIX + '10'))).toBe('block-reward');
		expect(reward(new TextEncoder().encode(BLOCK_REWARD_NOTE_PREFIX + '11'))).toBe('payment');
	});
	it('maps only verified SDK query methods and supplies an abort signal to do', async () => {
		const builder = {
			excludeCloseTo: vi.fn().mockReturnThis(),
			address: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			maxRound: vi.fn().mockReturnThis(),
			afterTime: vi.fn().mockReturnThis(),
			beforeTime: vi.fn().mockReturnThis(),
			nextToken: vi.fn().mockReturnThis(),
			do: vi.fn(async () => ({ currentRound: 100n, transactions: [] }))
		};
		const reader = createIndexerReader({
			searchForTransactions: () => builder,
			lookupAssetByID: vi.fn()
		});
		const signal = new AbortController().signal;
		expect(await reader.bootstrap('A', signal)).toBe(100n);
		expect(builder.limit).toHaveBeenLastCalledWith(1);
		await reader.readPage(
			{
				address: 'B',
				maxRound: 100n,
				limit: 500,
				afterTime: 'from',
				beforeTime: 'to',
				nextToken: 'next'
			},
			signal
		);
		expect(builder.address).toHaveBeenLastCalledWith('B');
		expect(builder.excludeCloseTo).toHaveBeenCalledWith(false);
		expect(builder.maxRound).toHaveBeenCalledWith(100n);
		expect(builder.limit).toHaveBeenLastCalledWith(500);
		expect(builder.afterTime).toHaveBeenCalledWith('from');
		expect(builder.beforeTime).toHaveBeenCalledWith('to');
		expect(builder.nextToken).toHaveBeenCalledWith('next');
		expect(builder.do).toHaveBeenLastCalledWith(undefined, { signal });
	});
});

describe('bounded sequential scans', () => {
	it('continues beyond five pages and through empty cursor pages, pins every account and deduplicates full roots', async () => {
		const pages = [
			page('1', '1'),
			{ transactions: [], nextToken: '2' },
			...[3, 4, 5, 6].map((n) => page(String(n), String(n))),
			page('7'),
			page('1')
		];
		const { run, readPage } = setup(pages, {}, { addresses: ['A', 'B'] });
		const result = await run.start();
		expect(result.status).toBe('complete-indexed');
		expect(result.pages).toBe(8);
		expect(result.scanned).toBe(7);
		expect(result.rows).toHaveLength(18);
		expect(result.completedAddresses).toEqual(['A', 'B']);
		expect(
			readPage.mock.calls.map((call) => (call as unknown as [ExportQuery])[0].maxRound)
		).toEqual(Array(8).fill(100n));
	});
	it('treats a full final page with no cursor as complete at the page cap', async () => {
		const { run } = setup(
			[{ transactions: Array.from({ length: 500 }, (_, i) => raw(String(i))) }],
			{ maxPages: 1 }
		);
		expect(await run.start()).toMatchObject({ status: 'complete-indexed', pages: 1, scanned: 500 });
	});
	it('rolls back an entire malformed page, then manually retries exactly its cursor', async () => {
		const { run, readPage } = setup([
			page('1', 'next'),
			{ transactions: [raw('2'), raw('bad', { fee: -1n })] },
			page('2')
		]);
		expect(await run.start()).toMatchObject({
			status: 'partial-error',
			pages: 1,
			boundary: { source: 'indexer', address: 'A', nextToken: 'next' },
			canRetry: true
		});
		const result = await run.retry();
		expect(result.status).toBe('complete-indexed');
		expect(result.rows).toHaveLength(4);
		expect(result.pages).toBe(2);
		expect(
			readPage.mock.calls.slice(1).map((call) => (call as unknown as [ExportQuery])[0].nextToken)
		).toEqual(['next', 'next']);
	});
	it.each(['conflict', 'cursor', 'oversize'])(
		'rejects %s pages without committing their checkpoint',
		async (kind) => {
			const second =
				kind === 'conflict'
					? { transactions: [raw('1', { fee: 2n })] }
					: kind === 'cursor'
						? page('2', 'next')
						: { transactions: Array(501).fill(raw('2')) };
			const { run } = setup([page('1', 'next'), second]);
			const result = await run.start();
			expect(result.status).toBe('partial-error');
			expect(result.pages).toBe(1);
			expect(result.rows).toHaveLength(2);
			if (kind === 'cursor') expect(result.canRetry).toBe(false);
		}
	);
	it.each([{ maxPages: 1 }, { maxRows: 2 }])('caps an unfinished boundary %j', async (caps) => {
		const { run } = setup([page('1', 'next')], caps);
		expect(await run.start()).toMatchObject({
			status: 'partial-cap',
			pages: 1,
			unfinishedAddresses: ['A'],
			boundary: { source: 'indexer', address: 'A', nextToken: 'next' }
		});
	});
	it('retains none of a page exceeding the row cap and completes at an exact terminal row limit', async () => {
		expect(await setup([page('1')], { maxRows: 1 }).run.start()).toMatchObject({
			status: 'partial-cap',
			pages: 0,
			rows: []
		});
		expect(await setup([page('1')], { maxRows: 2 }).run.start()).toMatchObject({
			status: 'complete-indexed',
			pages: 1
		});
	});
	it('counts filtered scans toward caps and never calls a zero-row cap empty', async () => {
		const { run } = setup([page('1', 'next')], { maxPages: 1 }, { types: ['close-out'] });
		expect(await run.start()).toMatchObject({
			status: 'partial-cap',
			rows: [],
			pages: 1,
			scanned: 1
		});
	});
	it('applies exact UTC boundaries after server overfetch', async () => {
		const { run } = setup(
			[
				{
					transactions: [-1, 0, 86399, 86400].map((delta) =>
						raw(String(delta), { roundTime: 1704067200 + delta })
					)
				}
			],
			{},
			{ allDates: false, from: '2024-01-01', through: '2024-01-01' }
		);
		expect((await run.start()).rows).toHaveLength(4);
	});
});

describe('retry, pacing and cancellation', () => {
	it('retries a malformed indexer page and completes with its rows', async () => {
		const { run, readPage } = setup([new SyntaxError('Unexpected token <'), page('recovered')]);
		const result = await run.start();
		expect(result.status).toBe('complete-indexed');
		expect(result.rows.map((row) => row.txId)).toEqual(['recovered', 'recovered']);
		expect(readPage).toHaveBeenCalledTimes(2);
	});
	it('spaces bootstrap and page starts by at least 500ms and respects Retry-After', async () => {
		let now = 0;
		const starts: number[] = [];
		const delays: number[] = [];
		const { run } = setup([], {
			now: () => now,
			sleep: async (ms) => {
				delays.push(ms);
				now += ms;
			},
			bootstrap: async () => {
				starts.push(now);
				return 100n;
			},
			readPage: async () => {
				starts.push(now);
				if (starts.length === 2) throw httpError(429, '3');
				return page('1');
			}
		});
		expect((await run.start()).status).toBe('complete-indexed');
		expect(starts).toEqual([0, 500, 3500]);
		expect(delays.reduce((a, b) => a + b, 0)).toBe(3500);
	});
	it('retries 1/2/4 seconds then preserves the failed page for manual retry', async () => {
		const delays: number[] = [];
		let now = 0;
		const { run, readPage } = setup(
			[httpError(503), httpError(503), httpError(503), httpError(503), page('1')],
			{
				now: () => now,
				sleep: async (ms) => {
					delays.push(ms);
					now += ms;
				}
			}
		);
		expect(await run.start()).toMatchObject({ status: 'partial-error', pages: 0, canRetry: true });
		expect(readPage).toHaveBeenCalledTimes(4);
		expect(now).toBe(7500);
		expect((await run.retry()).status).toBe('complete-indexed');
	});
	it('does not retry other 4xx and requires restart for an invalid cursor', async () => {
		const { run, readPage } = setup([page('1', 'expired'), httpError(400)]);
		expect(await run.start()).toMatchObject({ status: 'partial-error', canRetry: false, pages: 1 });
		expect(readPage).toHaveBeenCalledTimes(2);
	});
	it('cancels an in-flight page immediately, aborts it and ignores late resolution', async () => {
		let resolve!: (value: ExportPage) => void;
		let signal!: AbortSignal;
		const { run } = setup([], {
			readPage: async (_q, s) => {
				signal = s;
				return new Promise((r) => {
					resolve = r;
				});
			}
		});
		const result = run.start();
		await vi.waitFor(() => expect(resolve).toBeDefined());
		run.cancel();
		expect(await result).toMatchObject({ status: 'partial-cancelled', rows: [], pages: 0 });
		expect(signal.aborted).toBe(true);
		resolve(page('late'));
		await Promise.resolve();
		expect((await run.retry()).rows).toHaveLength(0);
	});
	it('enforces the deadline and waits for the old transport before retrying the same boundary', async () => {
		vi.useFakeTimers();
		let signal!: AbortSignal;
		let resolve!: (page: ExportPage) => void;
		const readPage = vi.fn(async (_query: ExportQuery, requestSignal: AbortSignal) => {
			signal = requestSignal;
			if (readPage.mock.calls.length === 1)
				return new Promise<ExportPage>((r) => {
					resolve = r;
				});
			return page('retry');
		});
		const { run } = setup([], { readPage });
		const pending = run.start();
		await vi.advanceTimersByTimeAsync(30000);
		expect(await pending).toMatchObject({
			status: 'partial-error',
			pages: 0,
			rows: [],
			canRetry: true
		});
		expect(signal.aborted).toBe(true);
		const retried = run.retry();
		await vi.advanceTimersByTimeAsync(0);
		expect(readPage).toHaveBeenCalledTimes(1);
		resolve(page('late'));
		await vi.advanceTimersByTimeAsync(0);
		const result = await retried;
		expect(result).toMatchObject({ status: 'complete-indexed', pages: 1 });
		expect(result.rows.map((row) => row.txId)).toEqual(['retry', 'retry']);
		expect(readPage.mock.calls.map(([query]) => query.nextToken)).toEqual([undefined, undefined]);
	});
});

const [A, B, K] = [1, 2, 3].map((value) => encodeAddress(new Uint8Array(32).fill(value)));
const assetTx = (
	id = 'ASSET',
	assetId: bigint | string = 1n,
	changes: Record<string, unknown> = {}
) =>
	raw(id, {
		txType: 'axfer',
		sender: A,
		paymentTransaction: undefined,
		assetTransferTransaction: { assetId, receiver: B, amount: 5n, ...changes }
	});
const metadata = (id: bigint, decimals = 8n) => ({
	asset: { index: id, deleted: true, params: { decimals, 'unit-name': 'UNIT', name: 'Asset' } }
});
const assetInput: Partial<ExportInput> = {
	pageAddress: A,
	addresses: [A, B],
	assets: { mode: 'all' }
};
const assetSetup = (
	pages: (ExportPage | Error)[],
	deps: Partial<ExportDependencies> = {},
	input: Partial<ExportInput> = {}
) => setup(pages, deps, { ...assetInput, ...input });

describe('asset normalization', () => {
	it('normalizes SDK clawback, close and nested bodies without changing the fee payer', () => {
		const tx = normalizeTransaction(
			raw('ROOT', {
				txType: 'appl',
				applicationTransaction: { applicationId: 9n },
				innerTxns: [
					{
						...assetTx('CHILD', '9007199254740995', {
							sender: A,
							amount: '9007199254740993',
							closeAmount: '7',
							closeTo: K
						}),
						sender: K,
						closingAmount: 99n
					}
				]
			})
		);
		expect(tx.inner[0]).toMatchObject({
			sender: K,
			fee: 1n,
			assetTransfer: {
				assetId: 9007199254740995n,
				sender: A,
				receiver: B,
				amount: 9007199254740993n,
				closeAmount: 7n,
				closeTo: K
			}
		});
	});
	it.each([undefined, ALGORAND_ZERO_ADDRESS_STRING])(
		'normalizes absent or zero optional addresses %s',
		(address) => {
			expect(
				normalizeTransaction(assetTx('ROOT', 1n, { sender: address, closeTo: address }))
					.assetTransfer
			).toEqual({
				assetId: 1n,
				receiver: B,
				amount: 5n,
				closeAmount: 0n,
				sender: undefined,
				closeTo: undefined
			});
		}
	);
	it.each([
		{ assetId: 0n },
		{ assetId: 18446744073709551616n },
		{ assetId: 1 },
		{ amount: 1 },
		{ amount: -1n },
		{ amount: '1.5' },
		{ closeAmount: 1 },
		{ closeAmount: 1n },
		{ closeTo: 'bad' },
		{ closeTo: null },
		{ sender: '' },
		{ sender: 'bad' },
		{ receiver: 'bad' }
	])('rejects malformed asset fields %s', (changes) => {
		expect(() => normalizeTransaction(assetTx('ROOT', 1n, changes))).toThrow();
	});
	it.each([undefined, null, [], { amount: 1n }])('requires a complete asset body %s', (body) => {
		expect(() =>
			normalizeTransaction(raw('ROOT', { txType: 'axfer', assetTransferTransaction: body }))
		).toThrow();
	});
	it('validates immutable metadata and decodes text variants without inventing a symbol', () => {
		const result = normalizeAssetResponse(
			{
				asset: {
					index: 1n,
					params: { decimals: 0n, 'unit-name-b64': '5LiW55WM', 'name-b64': '/w==' }
				}
			},
			1n
		);
		expect(result).toEqual({ id: 1n, decimals: 0, unitName: '世界', name: 'base64:/w==' });
		expect(Object.isFrozen(result)).toBe(true);
		expect(normalizeAssetResponse({ asset: { index: 1n, params: { decimals: 19n } } }, 1n)).toEqual(
			{ id: 1n, decimals: 19, unitName: '', name: '' }
		);
		expect(
			normalizeAssetResponse(
				{ asset: { index: 1n, params: { decimals: 4n, name: '', 'name-b64': 'YQ==' } } },
				1n
			).name
		).toBe('');
	});
	it.each([
		{},
		{ asset: {} },
		{ asset: { index: 1n, params: {} } },
		metadata(2n),
		metadata(1n, -1n),
		metadata(1n, 20n),
		{ asset: { index: 1n, params: { decimals: 0 } } },
		{ asset: { index: 1n, params: { decimals: 0n, name: 1 } } },
		{ asset: { index: 1n, params: { decimals: 0n, 'unit-name-b64': 'not base64!' } } }
	])('rejects invalid raw metadata %s', (value) =>
		expect(() => normalizeAssetResponse(value, 1n)).toThrow()
	);
	it('reads raw bytes with include-all, bigint ID and abort signal, distinguishing absent decimals from zero', async () => {
		const id = 9007199254740995n;
		const body = (params: string) =>
			new TextEncoder().encode(
				`{"asset":{"index":9007199254740995,"deleted":true,"params":${params}}}`
			);
		const builder = {
			includeAll: vi.fn().mockReturnThis(),
			doRaw: vi
				.fn()
				.mockResolvedValueOnce(body('{"decimals":0}'))
				.mockResolvedValueOnce(body('{}'))
				.mockResolvedValueOnce(body('{"decimals":8}'))
				.mockResolvedValueOnce(new Uint8Array([255]))
		};
		const lookupAssetByID = vi.fn(() => builder);
		const reader = createIndexerReader({ searchForTransactions: vi.fn(), lookupAssetByID });
		const signal = new AbortController().signal;
		const zero = await reader.readAsset(id, signal);
		expect(zero).toMatchObject({ asset: { index: id, params: { decimals: 0n } } });
		expect(normalizeAssetResponse(zero, id).decimals).toBe(0);
		const absent = await reader.readAsset(id, signal);
		expect(() => normalizeAssetResponse(absent, id)).toThrow();
		expect(normalizeAssetResponse(await reader.readAsset(id, signal), id).decimals).toBe(8);
		await expect(reader.readAsset(id, signal)).rejects.toThrow();
		expect(lookupAssetByID).toHaveBeenCalledWith(id);
		expect(builder.includeAll).toHaveBeenCalledWith(true);
		expect(builder.doRaw).toHaveBeenCalledWith(undefined, { signal });
	});
});

describe('asset page commits and metadata demand', () => {
	it('resolves each asset once across pages, accounts and repeated inner transfers and deduplicates full roots', async () => {
		const tx = raw('ROOT', {
			txType: 'appl',
			applicationTransaction: { applicationId: 9n },
			innerTxns: [assetTx('I1'), assetTx('I2')]
		});
		const { run, deps } = assetSetup([
			{ transactions: [tx], nextToken: 'next' },
			{ transactions: [assetTx('SECOND', 2n)] },
			{ transactions: [tx, assetTx('SECOND', 2n)] }
		]);
		const result = await run.start();
		expect(result).toMatchObject({ status: 'partial-source', pages: 5, scanned: 4 });
		expect(result.rows).toHaveLength(9);
		expect(result.assets.size).toBe(2);
		expect(deps.readAsset).toHaveBeenCalledTimes(2);
		run.dispose();
		expect(result.assets.size).toBe(2);
		expect((await run.start()).assets.size).toBe(0);
	});
	it.each([
		{ assets: { mode: 'native' } },
		{ types: ['fee'] },
		{ types: ['payment'] },
		{ assets: { mode: 'asset', id: '99' } },
		{ allDates: false, from: '2024-02-01', through: '2024-02-01' }
	] satisfies Partial<ExportInput>[])('avoids metadata for excluded effects %j', async (input) => {
		const { run, deps } = assetSetup(
			[{ transactions: [assetTx()] }, { transactions: [] }],
			{},
			input
		);
		expect((await run.start()).status).toBe(
			!input.assets && !input.types ? 'partial-source' : 'complete-indexed'
		);
		expect(deps.readAsset).not.toHaveBeenCalled();
	});
	it('rejects conflicting asset bodies for the same root', async () => {
		const { run } = assetSetup([
			{ transactions: [assetTx()], nextToken: 'next' },
			{ transactions: [assetTx('ASSET', 1n, { amount: 6n })] }
		]);
		expect(await run.start()).toMatchObject({
			status: 'partial-error',
			pages: 1,
			scanned: 1,
			reason: 'Conflicting copies of an indexed transaction.'
		});
	});
	it('rolls back page two on metadata 404, preserves the transaction cursor and valid cache, and retries only the failed asset', async () => {
		const readAsset = vi.fn(async (id: bigint) => {
			if (id === 3n && readAsset.mock.calls.filter(([value]) => value === 3n).length === 1)
				throw httpError(404);
			return metadata(id);
		});
		const second = { transactions: [assetTx('TWO', 2n), assetTx('THREE', 3n)], nextToken: 'last' };
		const progress = vi.fn();
		const { run, readPage } = assetSetup(
			[{ transactions: [assetTx()], nextToken: 'next' }, second, second, { transactions: [] }],
			{ readAsset, onProgress: progress },
			{ addresses: [A] }
		);
		const partial = await run.start();
		expect(partial).toMatchObject({
			status: 'partial-error',
			pages: 1,
			scanned: 1,
			boundary: { source: 'indexer', address: A, nextToken: 'next' },
			canRetry: true,
			reason: 'Asset 3 metadata unavailable; this page was not included. Amounts were not guessed.'
		});
		expect(partial.rows).toHaveLength(2);
		expect([...partial.assets.keys()]).toEqual([1n, 2n]);
		expect(progress).toHaveBeenCalledWith(
			expect.objectContaining({
				pages: 1,
				rows: 2,
				scanned: 1,
				assetsResolved: 2,
				resolvingAssetId: 3n
			})
		);
		const complete = await run.retry();
		expect(complete).toMatchObject({ status: 'partial-source', pages: 4, scanned: 3 });
		expect(complete.rows).toHaveLength(6);
		expect(readAsset.mock.calls.map(([id]) => id)).toEqual([1n, 2n, 3n, 3n]);
		expect(
			readPage.mock.calls.map((call) => (call as unknown as [ExportQuery])[0].nextToken)
		).toEqual([undefined, 'next', 'next', 'last']);
		expect([...partial.assets.keys()]).toEqual([1n, 2n]);
	});
	it('preflights the asset union cap before any new page lookup', async () => {
		const { run, deps } = assetSetup(
			[
				{ transactions: [assetTx()], nextToken: 'next' },
				{ transactions: [assetTx('TWO', 2n), assetTx('THREE', 3n)] }
			],
			{ maxAssets: 2 }
		);
		expect(await run.start()).toMatchObject({
			status: 'partial-cap',
			pages: 1,
			scanned: 1,
			boundary: { source: 'indexer', address: A, nextToken: 'next' },
			reason: 'Asset limit reached; select one asset or narrow the dates.'
		});
		expect(deps.readAsset).toHaveBeenCalledTimes(1);
	});
	it('rolls back expanded asset effects at the row cap before metadata lookup', async () => {
		const { run, deps } = assetSetup(
			[{ transactions: [assetTx('ROOT', 1n, { closeTo: B, closeAmount: 0n })] }],
			{ maxRows: 4 }
		);
		expect(await run.start()).toMatchObject({
			status: 'partial-cap',
			rows: [],
			pages: 0,
			scanned: 0
		});
		expect(deps.readAsset).not.toHaveBeenCalled();
	});
});

describe('metadata request lifecycle', () => {
	it('shares pacing and 429 backoff with bootstrap and transaction requests', async () => {
		let now = 0;
		const starts: number[] = [];
		const readAsset = vi.fn(async (id: bigint) => {
			starts.push(now);
			if (readAsset.mock.calls.length === 1) throw httpError(429, '3');
			return metadata(id);
		});
		const { run } = assetSetup(
			[],
			{
				now: () => now,
				sleep: async (ms) => {
					now += ms;
				},
				bootstrap: async () => {
					starts.push(now);
					return 100n;
				},
				readPage: async () => {
					starts.push(now);
					return { transactions: [assetTx()] };
				},
				readAsset
			},
			{ addresses: [A] }
		);
		expect((await run.start()).status).toBe('partial-source');
		expect(starts).toEqual([0, 500, 1000, 4000]);
	});
	it.each(['cancel', 'dispose'] as const)(
		'ignores late metadata and progress after %s',
		async (action) => {
			let resolve!: (value: unknown) => void;
			let signal!: AbortSignal;
			const progress = vi.fn();
			const { run } = assetSetup([{ transactions: [assetTx()] }], {
				onProgress: progress,
				readAsset: async (_id, s) => {
					signal = s;
					return new Promise((r) => {
						resolve = r;
					});
				}
			});
			const pending = run.start();
			await vi.waitFor(() => expect(resolve).toBeDefined());
			run[action]();
			expect(await pending).toMatchObject({
				status: 'partial-cancelled',
				rows: [],
				pages: 0,
				assets: new Map()
			});
			expect(signal.aborted).toBe(true);
			const count = progress.mock.calls.length;
			resolve(metadata(1n));
			await Promise.resolve();
			expect((await run.retry()).assets.size).toBe(0);
			expect(progress).toHaveBeenCalledTimes(count);
		}
	);
	it('times out metadata without committing it and waits for the old transport before retry', async () => {
		vi.useFakeTimers();
		let resolve!: (value: unknown) => void;
		let signal!: AbortSignal;
		const readAsset = vi.fn(async (id: bigint, s: AbortSignal) => {
			signal = s;
			if (readAsset.mock.calls.length === 1)
				return new Promise((r) => {
					resolve = r;
				});
			return metadata(id);
		});
		const { run, readPage } = assetSetup(
			[{ transactions: [assetTx()] }, { transactions: [assetTx()] }],
			{ readAsset },
			{ addresses: [A] }
		);
		const pending = run.start();
		await vi.advanceTimersByTimeAsync(30000);
		expect(await pending).toMatchObject({
			status: 'partial-error',
			rows: [],
			pages: 0,
			assets: new Map(),
			canRetry: true
		});
		expect(signal.aborted).toBe(true);
		const retried = run.retry();
		await vi.advanceTimersByTimeAsync(0);
		expect(readPage).toHaveBeenCalledTimes(1);
		resolve(metadata(1n));
		await vi.advanceTimersByTimeAsync(0);
		const result = await retried;
		expect(result).toMatchObject({ status: 'partial-source', pages: 2 });
		expect(result.assets.size).toBe(1);
		expect(readAsset).toHaveBeenCalledTimes(2);
	});
});

it('captures loaded staking contracts for the CSV without extra reads', async () => {
	const stakingContracts = new Map([['B', '9007199254740993']]);
	const { run, deps } = setup([page('ROOT')], { stakingContracts });
	stakingContracts.set('B', '99');
	const result = await run.start();
	expect(result.stakingContracts).toEqual(new Map([['B', '9007199254740993']]));
	expect(deps.bootstrap).toHaveBeenCalledTimes(1);
	expect(deps.readPage).toHaveBeenCalledTimes(1);
	expect(deps.readAsset).not.toHaveBeenCalled();
});

const arcRecord = (changes: Record<string, unknown> = {}) => ({
	contractid: '1',
	from: A,
	to: B,
	amount: '9007199254740993',
	round: 100,
	timestamp: 1704067200,
	transactionid: null,
	note: null,
	...changes
});
const arcMetadata = (id: bigint, decimals: number | null = 18) => ({
	tokens: [{ contractId: id.toString(), decimals, symbol: 'TOKEN', name: 'Token' }]
});
function arcSetup(changes: Partial<ExportDependencies> = {}, input: Partial<ExportInput> = {}) {
	return setup(
		[],
		{
			readPage: vi.fn(async () => ({ transactions: [] })),
			readArc200Page: vi.fn(async () => []),
			readArc200Metadata: vi.fn(async (id) => arcMetadata(id)),
			...changes
		},
		{ ...assetInput, addresses: [A], ...input }
	);
}
describe('bounded ARC-200 export phase', () => {
	it('pins both sources and all accounts once, keeps counterpart effects and never claims completeness after late insertion', async () => {
		const readArc200Page = vi.fn(async () => [arcRecord(), arcRecord()]);
		const { run, deps } = arcSetup({ readArc200Page }, { addresses: [A, B, A] });
		const result = await run.start();
		expect(result).toMatchObject({
			status: 'partial-source',
			snapshotRound: 100n,
			pages: 4,
			arc200Scanned: 4,
			completedAddresses: [A, B],
			unfinishedAddresses: [],
			sourceScans: { indexer: [A, B], arc200: [A, B] }
		});
		expect(result.warnings.join(' ')).toMatch(/source may omit transfer logs/);
		expect(result.rows.map((r) => [r.account, r.direction])).toEqual([
			[A, 'out'],
			[A, 'out'],
			[B, 'in'],
			[B, 'in']
		]);
		expect(deps.bootstrap).toHaveBeenCalledTimes(1);
		expect(readArc200Page.mock.calls).toHaveLength(2);
		for (const [query] of readArc200Page.mock.calls as unknown as [
			{ maxRound: bigint; minRound: bigint }
		][])
			expect(query).toMatchObject({ maxRound: 100n, minRound: 1n });
		expect(deps.readArc200Metadata).toHaveBeenCalledTimes(1);
		run.dispose();
		expect((await run.start()).arc200Assets.size).toBe(0);
		expect(result.arc200Assets.size).toBe(1);
		const next = arcSetup({ readArc200Page: async () => [arcRecord({ round: 99 })] });
		expect((await next.run.start()).status).toBe('partial-source');
		expect(next.deps.readArc200Metadata).toHaveBeenCalledTimes(1);
	});
	it('rejects a post-snapshot record atomically without automatic schema retries', async () => {
		const readArc200Page = vi.fn(async () => [arcRecord(), arcRecord({ round: 101 })]);
		const { run } = arcSetup({ readArc200Page });
		expect(await run.start()).toMatchObject({
			status: 'partial-error',
			rows: [],
			sourceScans: { indexer: [A], arc200: [] },
			unfinishedAddresses: [A]
		});
		expect(readArc200Page).toHaveBeenCalledTimes(1);
	});
	it('retries an inclusive uncommitted boundary exactly once and withholds its partial oldest round', async () => {
		const first = [...Array(99).fill(arcRecord({ round: 100 })), arcRecord({ round: 99 })];
		const readArc200Page = vi
			.fn()
			.mockResolvedValueOnce(first)
			.mockRejectedValueOnce(httpError(400))
			.mockResolvedValueOnce([arcRecord({ round: 99 }), arcRecord({ round: 99 })]);
		const { run, deps } = arcSetup({ readArc200Page });
		expect(await run.start()).toMatchObject({
			status: 'partial-error',
			rows: expect.any(Array),
			boundary: { source: 'arc200', address: A, upperRound: 99n },
			canRetry: true
		});
		const result = await run.retry();
		expect(result.status).toBe('partial-source');
		expect(result.rows).toHaveLength(101);
		expect(result.rows.filter((r) => r.round === 99n)).toHaveLength(2);
		expect(readArc200Page.mock.calls.map(([q]) => [q.minRound, q.maxRound])).toEqual([
			[1n, 100n],
			[1n, 99n],
			[1n, 99n]
		]);
		expect(deps.bootstrap).toHaveBeenCalledTimes(1);
		expect(deps.readArc200Metadata).toHaveBeenCalledTimes(1);
	});
	it('counts empty windows and steps through the last lower bound with All indexed dates', async () => {
		const { run, deps } = arcSetup({ bootstrap: async () => 2000001n });
		expect(await run.start()).toMatchObject({
			status: 'partial-source',
			pages: 4,
			rows: [],
			completedAddresses: [A]
		});
		expect(
			vi.mocked(deps.readArc200Page).mock.calls.map(([q]) => [q.minRound, q.maxRound])
		).toEqual([
			[1000002n, 2000001n],
			[2n, 1000001n],
			[1n, 1n]
		]);
		expect(deps.readPage).toHaveBeenCalledTimes(1);
	});
	it('stops empty windows at the shared 200-response cap', async () => {
		const { run, deps } = arcSetup({ bootstrap: async () => 500000000n });
		const result = await run.start();
		expect(result).toMatchObject({
			status: 'partial-cap',
			pages: 200,
			rows: [],
			unfinishedAddresses: [A]
		});
		expect(deps.readArc200Page).toHaveBeenCalledTimes(199);
		expect(result.reason).toContain(
			'ARC-200 history is scanned in windows of up to 1,000,000 rounds; long date ranges or many accounts may reach the cap.'
		);
	});
	it('derives one shared padded lower bound from the first returned round and stops there', async () => {
		const readPage = vi.fn(async (q: ExportQuery) => ({
			transactions: q.address ? [] : [raw('FIRST', { confirmedRound: 1501000n })]
		}));
		const { run, deps } = arcSetup(
			{ bootstrap: async () => 3000000n, readPage },
			{ allDates: false, from: '2024-01-01', through: '2024-01-02', addresses: [A, B] }
		);
		expect(await run.start()).toMatchObject({ status: 'partial-source', pages: 7 });
		expect(readPage.mock.calls.filter(([q]) => !q.address).map(([q]) => q)).toEqual([
			{ afterTime: '2024-01-01T00:00:00.000Z', limit: 1, maxRound: 3000000n }
		]);
		expect(
			vi.mocked(deps.readArc200Page).mock.calls.map(([q]) => [q.minRound, q.maxRound])
		).toEqual([
			[2000001n, 3000000n],
			[1500000n, 2000000n],
			[2000001n, 3000000n],
			[1500000n, 2000000n]
		]);
	});
	it.each([1n, 999n])(
		'clamps the padded lower bound to round 1 for first round %s',
		async (first) => {
			const { run, deps } = arcSetup(
				{
					bootstrap: async () => 2000n,
					readPage: async (q) => ({ transactions: q.address ? [] : [{ confirmedRound: first }] })
				},
				{ allDates: false, from: '2024-01-01', through: '2024-01-01' }
			);
			expect((await run.start()).status).toBe('partial-source');
			expect(deps.readArc200Page).toHaveBeenCalledWith(
				{ address: A, minRound: 1n, maxRound: 2000n },
				expect.any(AbortSignal)
			);
		}
	);
	it('skips ARC for every account when the single lower-bound search is empty', async () => {
		const { run, deps } = arcSetup(
			{},
			{ allDates: false, from: '2024-01-01', through: '2024-01-01', addresses: [A, B] }
		);
		expect(await run.start()).toMatchObject({
			status: 'partial-source',
			pages: 3,
			completedAddresses: [A, B],
			rows: []
		});
		expect(deps.readPage).toHaveBeenCalledTimes(3);
		expect(deps.readArc200Page).not.toHaveBeenCalled();
	});
	it('counts the lower-bound request against the shared cap before starting ARC', async () => {
		const { run, deps } = arcSetup(
			{
				maxPages: 2,
				readPage: async (q) => ({ transactions: q.address ? [] : [{ confirmedRound: 1n }] })
			},
			{ allDates: false, from: '2024-01-01', through: '2024-01-01' }
		);
		expect(await run.start()).toMatchObject({ status: 'partial-cap', pages: 2 });
		expect(deps.readArc200Page).not.toHaveBeenCalled();
	});
	it('keeps a full-page boundary within the same window lower bound', async () => {
		const readArc200Page = vi
			.fn()
			.mockResolvedValueOnce([
				...Array(99).fill(arcRecord({ round: 2000000 })),
				arcRecord({ round: 1500000 })
			])
			.mockResolvedValue([]);
		const { run } = arcSetup({ bootstrap: async () => 2000000n, readArc200Page });
		expect((await run.start()).status).toBe('partial-source');
		expect(readArc200Page.mock.calls.map(([q]) => [q.minRound, q.maxRound])).toEqual([
			[1000001n, 2000000n],
			[1000001n, 1500000n],
			[1n, 1000000n]
		]);
	});
	it('stops on a dense round with none of the round retained and no metadata lookups', async () => {
		const { run, deps } = arcSetup({
			readArc200Page: vi.fn(async () => Array(100).fill(arcRecord()))
		});
		expect(await run.start()).toMatchObject({
			status: 'partial-cap',
			dataResponses: 2,
			rows: [],
			canRetry: false,
			reason: expect.stringContaining('round 100 fills the 100-record window')
		});
		expect(deps.readArc200Metadata).not.toHaveBeenCalled();
	});
	it.each([
		{ assets: { mode: 'native' } },
		{ assets: { mode: 'asset', id: '1' } },
		{ types: ['fee'] }
	] satisfies Partial<ExportInput>[])(
		'does not request ARC outside its scope %j',
		async (input) => {
			const { run, deps } = arcSetup({}, input);
			expect((await run.start()).status).toBe('complete-indexed');
			expect(deps.readArc200Page).not.toHaveBeenCalled();
		}
	);
	it('uses separate ASA/ARC caches, caches unknown scales, and only resolves filtered contracts', async () => {
		const { run, deps } = arcSetup(
			{
				readPage: async (q) => ({
					transactions: q.address ? [assetTx()] : [{ confirmedRound: 1n }]
				}),
				readArc200Page: async () => [
					arcRecord(),
					arcRecord(),
					arcRecord({ contractid: '2', timestamp: 1703980800 })
				],
				readArc200Metadata: vi.fn(async (id) => arcMetadata(id, null))
			},
			{ allDates: false, from: '2024-01-01', through: '2024-01-01' }
		);
		const result = await run.start();
		expect(result.status).toBe('partial-source');
		expect(result.assets.size).toBe(1);
		expect(result.arc200Assets.size).toBe(1);
		expect(deps.readAsset).toHaveBeenCalledTimes(1);
		expect(deps.readArc200Metadata).toHaveBeenCalledTimes(1);
		expect(result.arc200Assets.get(1n)?.decimals).toBeNull();
		expect(result.warnings.join(' ')).toMatch(/raw units.*1/);
	});
	it.each(['rows', 'metadata'] as const)(
		'preflights the shared %s cap without partial ARC page commit',
		async (cap) => {
			const { run, deps } = arcSetup({
				readPage: async () => ({ transactions: [assetTx()] }),
				readArc200Page: async () => [arcRecord(), arcRecord({ contractid: '2' })],
				...(cap === 'rows' ? { maxRows: 3 } : { maxAssets: 2 })
			});
			const result = await run.start();
			expect(result.status).toBe('partial-cap');
			expect(result.rows).toHaveLength(2);
			expect(result.rows.some((r) => r.assetKind === 'arc200')).toBe(false);
			expect(deps.readArc200Metadata).not.toHaveBeenCalled();
		}
	);
	it('does not start ARC if the native phase stops early', async () => {
		const { run, deps } = arcSetup({
			readPage: async () => ({ transactions: [], nextToken: 'next' }),
			maxPages: 1
		});
		expect(await run.start()).toMatchObject({
			status: 'partial-cap',
			sourceScans: { indexer: [], arc200: [] }
		});
		expect(deps.readArc200Page).not.toHaveBeenCalled();
	});
	it('supports sparse full pages until the shared response cap without conventional offsets', async () => {
		const { run, deps } = arcSetup({
			bootstrap: async () => 100000n,
			readArc200Page: vi.fn(async (q) =>
				Array.from({ length: 100 }, (_, i) => arcRecord({ round: Number(q.maxRound) - i }))
			),
			maxRows: 30000
		});
		expect(await run.start()).toMatchObject({ status: 'partial-cap', pages: 200 });
		expect(deps.readArc200Page).toHaveBeenCalledTimes(199);
		for (const [q] of vi.mocked(deps.readArc200Page).mock.calls)
			expect(q).not.toHaveProperty('offset');
	});
});

describe('ARC request lifecycle', () => {
	it('fails a malformed ARC-200 page without retrying', async () => {
		const readArc200Page = vi.fn().mockRejectedValue(new SyntaxError('Unexpected token <'));
		const { run } = arcSetup({ readArc200Page });
		expect(await run.start()).toMatchObject({ status: 'partial-error', rows: [] });
		expect(readArc200Page).toHaveBeenCalledTimes(1);
	});
	it('shares 500ms spacing and Retry-After between sources and metadata', async () => {
		let clock = 0;
		const starts: number[] = [];
		const readArc200Page = vi.fn(async () => {
			starts.push(clock);
			if (readArc200Page.mock.calls.length === 1) throw httpError(429, '3');
			return [arcRecord()];
		});
		const { run } = arcSetup({
			now: () => clock,
			sleep: async (ms) => {
				clock += ms;
			},
			bootstrap: async () => {
				starts.push(clock);
				return 100n;
			},
			readPage: async () => {
				starts.push(clock);
				return { transactions: [] };
			},
			readArc200Page,
			readArc200Metadata: async (id) => {
				starts.push(clock);
				return arcMetadata(id);
			}
		});
		expect((await run.start()).status).toBe('partial-source');
		expect(starts).toEqual([0, 500, 1000, 4000, 4500]);
	});
	it('backs off 1/2/4 seconds for metadata failures and manually retries its staged page', async () => {
		let clock = 0;
		const readArc200Metadata = vi
			.fn()
			.mockRejectedValueOnce(httpError(503))
			.mockRejectedValueOnce(httpError(503))
			.mockRejectedValueOnce(httpError(503))
			.mockRejectedValueOnce(httpError(503))
			.mockResolvedValue(arcMetadata(1n));
		const { run, deps } = arcSetup({
			now: () => clock,
			sleep: async (ms) => {
				clock += ms;
			},
			readArc200Page: vi.fn(async () => [arcRecord()]),
			readArc200Metadata
		});
		expect(await run.start()).toMatchObject({
			status: 'partial-error',
			rows: [],
			boundary: { source: 'arc200', address: A, upperRound: 100n }
		});
		expect(clock).toBe(8500);
		expect(readArc200Metadata).toHaveBeenCalledTimes(4);
		expect((await run.retry()).rows).toHaveLength(1);
		expect(deps.readArc200Page).toHaveBeenCalledTimes(2);
	});
	it.each(['page', 'metadata', 'boundary'] as const)(
		'cancels during ARC %s and ignores late completion',
		async (phase) => {
			let resolve!: (value: unknown) => void;
			let signal!: AbortSignal;
			const pendingRead = (_q: unknown, s: AbortSignal) => {
				signal = s;
				return new Promise<unknown>((r) => {
					resolve = r;
				});
			};
			const readArc200Page = vi.fn(async (q, s) =>
				phase === 'page' || (phase === 'boundary' && q.maxRound === 99n)
					? pendingRead(q, s)
					: phase === 'boundary'
						? [...Array(99).fill(arcRecord()), arcRecord({ round: 99 })]
						: [arcRecord()]
			);
			const { run } = arcSetup({
				readArc200Page,
				...(phase === 'metadata' ? { readArc200Metadata: pendingRead } : {})
			});
			const pending = run.start();
			await vi.waitFor(() => expect(resolve).toBeDefined());
			run.cancel();
			const result = await pending;
			expect(result.status).toBe('partial-cancelled');
			expect(result.rows).toHaveLength(phase === 'boundary' ? 99 : 0);
			expect(signal.aborted).toBe(true);
			resolve(phase === 'metadata' ? arcMetadata(1n) : [arcRecord()]);
			await Promise.resolve();
			expect((await run.retry()).rows).toHaveLength(result.rows.length);
		}
	);
	it('cancels during ARC backoff without another request', async () => {
		let backoff!: () => void;
		const { run, deps } = arcSetup({
			readArc200Page: vi.fn(async () => {
				throw httpError(503);
			}),
			sleep: async (ms, signal) => {
				if (ms === 1000)
					await new Promise<void>((resolve, reject) => {
						backoff = resolve;
						signal.addEventListener('abort', () => reject(signal.reason), { once: true });
					});
			}
		});
		const pending = run.start();
		await vi.waitFor(() => expect(backoff).toBeDefined());
		run.cancel();
		expect((await pending).status).toBe('partial-cancelled');
		expect(deps.readArc200Page).toHaveBeenCalledTimes(1);
	});
	it('times out ARC metadata and waits for transport settlement before boundary retry', async () => {
		vi.useFakeTimers();
		let resolve!: (value: unknown) => void;
		let signal!: AbortSignal;
		const readArc200Metadata = vi.fn(async (_id, s) => {
			signal = s;
			if (readArc200Metadata.mock.calls.length === 1)
				return new Promise((r) => {
					resolve = r;
				});
			return arcMetadata(1n);
		});
		const { run, deps } = arcSetup({
			readArc200Page: vi.fn(async () => [arcRecord()]),
			readArc200Metadata
		});
		const pending = run.start();
		await vi.advanceTimersByTimeAsync(30000);
		expect(await pending).toMatchObject({
			status: 'partial-error',
			rows: [],
			arc200Assets: new Map(),
			canRetry: true
		});
		expect(signal.aborted).toBe(true);
		const retried = run.retry();
		await vi.advanceTimersByTimeAsync(0);
		expect(deps.readArc200Page).toHaveBeenCalledTimes(1);
		resolve(arcMetadata(1n));
		await vi.advanceTimersByTimeAsync(0);
		expect((await retried).rows).toHaveLength(1);
		expect(readArc200Metadata).toHaveBeenCalledTimes(2);
	});
});

it('uses the same SDK reader without an address for the date lower-bound search', async () => {
	const builder = {
		excludeCloseTo: vi.fn().mockReturnThis(),
		address: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		maxRound: vi.fn().mockReturnThis(),
		afterTime: vi.fn().mockReturnThis(),
		beforeTime: vi.fn().mockReturnThis(),
		nextToken: vi.fn().mockReturnThis(),
		do: vi.fn(async () => ({ transactions: [{ confirmedRound: 2000n }] }))
	};
	const reader = createIndexerReader({
		searchForTransactions: () => builder,
		lookupAssetByID: vi.fn()
	});
	const signal = new AbortController().signal;
	await reader.readPage(
		{ afterTime: '2024-01-01T00:00:00.000Z', limit: 1, maxRound: 3000n },
		signal
	);
	expect(builder.address).not.toHaveBeenCalled();
	expect(builder.afterTime).toHaveBeenCalledWith('2024-01-01T00:00:00.000Z');
	expect(builder.limit).toHaveBeenCalledWith(1);
	expect(builder.maxRound).toHaveBeenCalledWith(3000n);
	expect(builder.do).toHaveBeenCalledWith(undefined, { signal });
});

const nftRecord = (changes: Record<string, unknown> = {}) => ({
	contractId: '5',
	tokenId: '7',
	fromAddr: A,
	toAddr: B,
	round: 100,
	timestamp: 1704067200,
	transactionId: 'TX',
	note: null,
	...changes
});
function nftPage(transfers: unknown[], changes: Record<string, unknown> = {}) {
	return {
		transfers,
		'next-token': null,
		'total-count': transfers.length,
		'current-round': 1000000000,
		...changes
	};
}
function nftSetup(changes: Partial<ExportDependencies> = {}, input: Partial<ExportInput> = {}) {
	return setup(
		[],
		{ readPage: vi.fn(async () => ({ transactions: [] })), ...changes },
		{ addresses: [A], types: ['payment', 'nft-transfer'], ...input }
	);
}
const windows = (fn: unknown) =>
	vi
		.mocked(fn as ExportDependencies['readArc72Page'])
		.mock.calls.map(([q]) => [q.minRound, q.maxRound]);
describe('NFT export phase', () => {
	it('makes no NFT request and adds no NFT disclosure when the type is not selected', async () => {
		const { run, deps } = nftSetup({}, { types: ['payment', 'asset-transfer'] });
		const result = await run.start();
		expect(deps.readArc72Page).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			status: 'complete-indexed',
			warnings: [],
			arc72Scanned: 0,
			completedAddresses: [A],
			sourceScans: { indexer: [A], arc200: [], arc72: [] }
		});
	});
	it('runs the NFT leg whatever the asset choice, with no ARC-200 reads, and stays complete-indexed', async () => {
		for (const assets of [{ mode: 'native' }, { mode: 'asset', id: '9' }] as const) {
			const readArc72Page = vi.fn(async () => nftPage([nftRecord()]));
			const { run, deps } = nftSetup({ readArc72Page }, { assets });
			const result = await run.start();
			expect(deps.readArc200Page).not.toHaveBeenCalled();
			expect(readArc72Page).toHaveBeenCalledTimes(1);
			expect(readArc72Page).toHaveBeenCalledWith(
				{ address: A, minRound: 1n, maxRound: 100n },
				expect.any(AbortSignal)
			);
			expect(result).toMatchObject({
				status: 'complete-indexed',
				arc72Scanned: 1,
				completedAddresses: [A],
				sourceScans: { arc72: [A] }
			});
			expect(result.warnings).toContain(ARC72_SOURCE_NOTE);
			expect(result.rows).toMatchObject([
				{
					assetKind: 'arc72',
					type: 'nft-transfer',
					direction: 'out',
					assetId: 5n,
					nftTokenId: 7n,
					nftEvent: 'transfer'
				}
			]);
		}
	});
	it('splits an oversize window without keeping its rows and re-doubles the span after each success', async () => {
		const readArc72Page = vi.fn(async (q: Arc72Query) =>
			q.maxRound === 2000000n && q.minRound < 1750001n
				? nftPage([nftRecord({ round: Number(q.maxRound) })], { 'total-count': 1001 })
				: q.minRound === 1250001n
					? nftPage([nftRecord({ round: 1600000 })])
					: nftPage([])
		);
		const { run } = nftSetup({ bootstrap: async () => 2000000n, readArc72Page });
		const result = await run.start();
		expect(windows(readArc72Page)).toEqual([
			[1000001n, 2000000n],
			[1500001n, 2000000n],
			[1750001n, 2000000n],
			[1250001n, 1750000n],
			[250001n, 1250000n],
			[1n, 250000n]
		]);
		expect(result.status).toBe('complete-indexed');
		expect(result.rows.map((r) => r.round)).toEqual([1600000n]);
		expect(result.arc72Scanned).toBe(3);
	});
	it.each([
		['a short page', nftPage([nftRecord()], { 'total-count': 2 })],
		['a page with a next token', nftPage([nftRecord()], { 'next-token': '1000' })]
	])('rolls back %s as a retryable error and retries the same window', async (_, bad) => {
		const readArc72Page = vi
			.fn()
			.mockResolvedValueOnce(nftPage([nftRecord({ round: 200000 })]))
			.mockResolvedValueOnce(bad)
			.mockResolvedValue(nftPage([nftRecord({ round: 1 })]));
		const { run } = nftSetup(
			{ bootstrap: async () => 1000100n, readArc72Page },
			{ addresses: [A] }
		);
		const failed = await run.start();
		expect(failed).toMatchObject({
			status: 'partial-error',
			canRetry: true,
			boundary: { source: 'arc72', address: A, upperRound: 100n },
			unfinishedAddresses: [A]
		});
		expect(failed.reason).toMatch(/total count/);
		expect(failed.rows.map((r) => r.round)).toEqual([200000n]);
		const result = await run.retry();
		expect(result.status).toBe('complete-indexed');
		expect(result.rows.map((r) => r.round)).toEqual([1n, 200000n]);
		expect(windows(readArc72Page)).toEqual([
			[101n, 1000100n],
			[1n, 100n],
			[1n, 100n]
		]);
	});
	it('ends the NFT leg at a dense round without keeping any of that page', async () => {
		const readArc72Page = vi.fn(async (q: Arc72Query) =>
			q.minRound <= 2n && q.maxRound >= 2n
				? nftPage([nftRecord({ round: 2 })], { 'total-count': 1001, 'current-round': 4 })
				: nftPage([nftRecord({ round: 3 })], { 'current-round': 4 })
		);
		const { run, deps } = nftSetup({ bootstrap: async () => 4n, readArc72Page });
		const result = await run.start();
		expect(windows(readArc72Page)).toEqual([
			[1n, 4n],
			[3n, 4n],
			[1n, 2n],
			[2n, 2n]
		]);
		expect(result).toMatchObject({
			status: 'partial-cap',
			canRetry: false,
			unfinishedAddresses: [A],
			boundary: { source: 'arc72', address: A, upperRound: 2n }
		});
		expect(result.rows.map((r) => r.round)).toEqual([3n]);
		expect(result.reason).toContain('NFT round 2 has more than 1,000 transfers');
		expect(result.reason).toContain(ARC72_CAP_WARNING);
		expect(deps.readArc200Page).not.toHaveBeenCalled();
	});
	it('counts every NFT response against the shared response cap', async () => {
		const { run, deps } = nftSetup({ bootstrap: async () => 500000000n, maxPages: 5 });
		const result = await run.start();
		expect(deps.readArc72Page).toHaveBeenCalledTimes(4);
		expect(result).toMatchObject({
			status: 'partial-cap',
			dataResponses: 5,
			unfinishedAddresses: [A]
		});
		expect(result.reason).toContain(ARC72_CAP_WARNING);
	});
	it('retains none of an NFT window that exceeds the row cap', async () => {
		const readArc72Page = vi.fn(async () => nftPage([nftRecord(), nftRecord()]));
		const { run } = nftSetup({ readArc72Page, maxRows: 1 });
		expect(await run.start()).toMatchObject({ status: 'partial-cap', rows: [] });
	});
	it('auto-retries while the NFT source is behind the snapshot round', async () => {
		const readArc72Page = vi
			.fn()
			.mockResolvedValueOnce(nftPage([], { 'current-round': 99 }))
			.mockResolvedValue(nftPage([nftRecord()]));
		const { run } = nftSetup({ readArc72Page });
		const result = await run.start();
		expect(readArc72Page).toHaveBeenCalledTimes(2);
		expect(result.status).toBe('complete-indexed');
		expect(result.rows).toHaveLength(1);
	});
	it('fails retryably, never with a short export, when the NFT source stays behind', async () => {
		const readArc72Page = vi.fn(async () => nftPage([nftRecord()], { 'current-round': 99 }));
		const { run } = nftSetup({ readArc72Page });
		const result = await run.start();
		expect(readArc72Page).toHaveBeenCalledTimes(4);
		expect(result).toMatchObject({ status: 'partial-error', canRetry: true, rows: [] });
		expect(result.reason).toMatch(/behind the snapshot round/);
	});
	it.each([
		['with ARC-200', { assets: { mode: 'all' }, types: ['asset-transfer', 'nft-transfer'] }],
		['without ARC-200', { types: ['nft-transfer'] }]
	] as const)('shares one date lower-bound request %s', async (_, input) => {
		const readPage = vi.fn(async (q: ExportQuery) => ({
			transactions: q.address ? [] : [raw('FIRST', { confirmedRound: 1501000n })]
		}));
		const { run, deps } = nftSetup(
			{
				bootstrap: async () => 3000000n,
				readPage,
				readArc72Page: vi.fn(async () => nftPage([], { 'current-round': 3000000 }))
			},
			{ allDates: false, from: '2024-01-01', through: '2024-01-02', addresses: [A, B], ...input }
		);
		const result = await run.start();
		expect(readPage.mock.calls.filter(([q]) => !q.address)).toHaveLength(1);
		expect(windows(deps.readArc72Page)).toEqual([
			[2000001n, 3000000n],
			[1500000n, 2000000n],
			[2000001n, 3000000n],
			[1500000n, 2000000n]
		]);
		expect(result.completedAddresses).toEqual([A, B]);
		expect(result.sourceScans.arc72).toEqual([A, B]);
	});
	it('skips the NFT leg for every account when the date lower-bound search is empty', async () => {
		const { run, deps } = nftSetup(
			{},
			{ allDates: false, from: '2024-01-01', through: '2024-01-01', addresses: [A, B] }
		);
		expect(await run.start()).toMatchObject({
			status: 'complete-indexed',
			completedAddresses: [A, B],
			rows: []
		});
		expect(deps.readArc72Page).not.toHaveBeenCalled();
	});
	it('keeps each selected account its own side of a transfer between them', async () => {
		const { run } = nftSetup(
			{ readArc72Page: vi.fn(async () => nftPage([nftRecord()])) },
			{ addresses: [A, B] }
		);
		const result = await run.start();
		expect(result.rows.map((r) => [r.account, r.direction])).toEqual([
			[A, 'out'],
			[B, 'in']
		]);
	});
	it('keeps identical transfers that one window returns as distinct source rows', async () => {
		const { run } = nftSetup({
			readArc72Page: vi.fn(async () => nftPage([nftRecord(), nftRecord()]))
		});
		const result = await run.start();
		expect(result.status).toBe('complete-indexed');
		expect(result.rows).toHaveLength(2);
	});
	it('skips the per-account indexer reads for an NFT-only run and still exports NFT rows', async () => {
		const readPage = vi.fn(async (q: ExportQuery) => ({
			transactions: q.address ? [raw('NATIVE')] : [raw('FIRST', { confirmedRound: 50n })]
		}));
		const progress = vi.fn();
		const { run, deps } = nftSetup(
			{
				readPage,
				readArc72Page: vi.fn(async () => nftPage([nftRecord()])),
				onProgress: progress
			},
			{
				types: ['nft-transfer'],
				allDates: false,
				from: '2024-01-01',
				through: '2024-01-02',
				addresses: [A, B]
			}
		);
		const result = await run.start();
		expect(deps.bootstrap).toHaveBeenCalledTimes(1);
		expect(readPage.mock.calls.filter(([q]) => q.address !== undefined)).toEqual([]);
		expect(readPage.mock.calls.filter(([q]) => q.address === undefined)).toHaveLength(1);
		expect(windows(deps.readArc72Page)).toEqual([
			[1n, 100n],
			[1n, 100n]
		]);
		expect(result).toMatchObject({
			status: 'complete-indexed',
			snapshotRound: 100n,
			pages: 3,
			scanned: 0,
			arc72Scanned: 2,
			dataResponses: 3,
			completedAddresses: [A, B],
			unfinishedAddresses: [],
			sourceScans: { indexer: [A, B], arc200: [], arc72: [A, B] },
			boundary: undefined
		});
		expect(result.rows.map((r) => [r.type, r.account])).toEqual([
			['nft-transfer', A],
			['nft-transfer', B]
		]);
		for (const [event] of progress.mock.calls)
			expect(event.account).toBeLessThanOrEqual(event.accounts);
		expect(progress.mock.calls.at(-1)![0]).toMatchObject({
			phase: 'arc72',
			account: 2,
			accounts: 2
		});
	});
	it('reports an NFT boundary, not an indexer one, when an NFT-only run fails', async () => {
		const readPage = vi.fn(async (q: ExportQuery) => ({
			transactions: q.address ? [raw('NATIVE')] : []
		}));
		const readArc72Page = vi
			.fn()
			.mockResolvedValueOnce(nftPage([nftRecord()]))
			.mockRejectedValue(new Error('NFT read failed'));
		const { run } = nftSetup(
			{ readPage, readArc72Page, sleep: async () => {} },
			{ types: ['nft-transfer'], addresses: [A, B] }
		);
		const result = await run.start();
		expect(readPage.mock.calls.filter(([q]) => q.address !== undefined)).toEqual([]);
		expect(result).toMatchObject({
			status: 'partial-error',
			canRetry: true,
			completedAddresses: [A],
			unfinishedAddresses: [B],
			sourceScans: { indexer: [A, B], arc72: [A] },
			boundary: { source: 'arc72', address: B, upperRound: 100n }
		});
	});
	it('still reads the indexer for every account when NFT transfers are mixed with another type', async () => {
		const readPage = vi.fn<ExportDependencies['readPage']>(async () => ({ transactions: [] }));
		const { run } = nftSetup(
			{ readPage, readArc72Page: vi.fn(async () => nftPage([])) },
			{ types: ['fee', 'nft-transfer'], addresses: [A, B] }
		);
		const result = await run.start();
		expect(readPage.mock.calls.map(([q]) => q.address)).toEqual([A, B]);
		expect(result).toMatchObject({
			status: 'complete-indexed',
			pages: 4,
			completedAddresses: [A, B],
			sourceScans: { indexer: [A, B], arc72: [A, B] }
		});
	});
});
