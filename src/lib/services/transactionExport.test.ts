import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createExportRun,
	normalizeTransaction,
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
			pageAddress: 'A',
			addresses: ['A'],
			allDates: true,
			types: ['payment', 'reward-payout', 'close-out', 'fee'],
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
			address: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			maxRound: vi.fn().mockReturnThis(),
			afterTime: vi.fn().mockReturnThis(),
			beforeTime: vi.fn().mockReturnThis(),
			nextToken: vi.fn().mockReturnThis(),
			do: vi.fn(async () => ({ currentRound: 100n, transactions: [] }))
		};
		const reader = createIndexerReader({ searchForTransactions: () => builder });
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
	it('enforces a 30-second deadline and discards late results', async () => {
		vi.useFakeTimers();
		let signal!: AbortSignal;
		const { run } = setup([], {
			readPage: async (_q, s) => {
				signal = s;
				return new Promise(() => {});
			}
		});
		const pending = run.start();
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(30000);
		const result = await pending;
		expect(result).toMatchObject({ status: 'partial-error', pages: 0, rows: [] });
		expect(signal.aborted).toBe(true);
	});
});
