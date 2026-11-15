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
import { normalizeOptions, type ExportInput, type ExportQuery } from '../wallet/transactionExport';

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
			types: ['payment', 'reward-payout', 'asset-transfer', 'close-out', 'fee'],
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
	const readPage = vi.fn(async () => {
		const page = pages.shift();
		if (page instanceof Error) throw page;
		if (!page) throw new Error('Unexpected read');
		return page;
	});
	const deps: ExportDependencies = {
		bootstrap: vi.fn(async () => 100n),
		readPage,
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
			cursor: 'next',
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
			cursor: 'next'
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
		expect(result).toMatchObject({ status: 'complete-indexed', pages: 3, scanned: 4 });
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
		expect((await run.start()).status).toBe('complete-indexed');
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
			cursor: 'next',
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
		expect(complete).toMatchObject({ status: 'complete-indexed', pages: 3, scanned: 3 });
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
			cursor: 'next',
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
		expect((await run.start()).status).toBe('complete-indexed');
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
		expect(result).toMatchObject({ status: 'complete-indexed', pages: 1 });
		expect(result.assets.size).toBe(1);
		expect(readAsset).toHaveBeenCalledTimes(2);
	});
});
