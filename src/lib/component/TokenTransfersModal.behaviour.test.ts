import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import { TransfersUnavailableError } from '$lib/services/tokenTransfers';

vi.mock('$lib/utils/algod', () => ({ algodClient: {}, algodIndexer: {} }));
vi.mock('$lib/utils/envoi', () => ({ getEnvoiNames: vi.fn() }));

const source = readFileSync(new URL('./TokenTransfersModal.svelte', import.meta.url), 'utf8');
const unavailable = "Couldn't load transfers right now. The history service isn't responding.";
const previous = { transactionid: 'page-one', from: 'other', to: 'wallet', amount: '1' };
const page = { transfers: [{ ...previous, transactionid: 'page-two' }], hasMore: true };

function modal(fetchTokenTransfers = vi.fn().mockResolvedValue(page)) {
	const logged = vi.fn();
	const context = createContext({
		Error,
		TransfersUnavailableError,
		fetchTokenTransfers,
		console: { error: logged },
		token: { id: '1', type: 'arc200' },
		walletId: 'wallet',
		transfers: [],
		isLoading: false,
		error: null,
		failedRequest: null,
		offset: 0,
		limit: 50,
		hasMore: true,
		nextToken: undefined,
		applyFilters: vi.fn()
	});
	const functions = ['fetchTransfers', 'handleScroll', 'retryTransfers', 'retryLpLabels'].map(
		(name) => source.match(new RegExp(`\\t(?:async )?function ${name}\\([^]*?\\n\\t\\}`))?.[0]
	);
	expect(functions[0], 'Extract fetchTransfers from the actual modal').toBeDefined();
	expect(functions[1], 'Extract handleScroll from the actual modal').toBeDefined();
	runInContext(
		ts.transpileModule(functions.filter(Boolean).join('\n'), {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	return {
		load: fetchTokenTransfers,
		logged,
		run: (code: string) => runInContext(code, context),
		fetch: (append = false) => runInContext(`fetchTransfers(${append})`, context) as Promise<void>,
		scroll: () =>
			runInContext(
				'handleScroll({ target: { scrollHeight: 100, scrollTop: 50, clientHeight: 50 } })',
				context
			)
	};
}

test('failed first load shows safe text, no transfers, and stops loading', async () => {
	const failure = new TransfersUnavailableError(new Error('fetch failed'));
	const { fetch, run, logged } = modal(vi.fn().mockRejectedValue(failure));
	await fetch();
	expect(run('error')).toBe(unavailable);
	expect(run('transfers')).toEqual([]);
	expect(run('isLoading')).toBe(false);
	expect(run('failedRequest')).toEqual({ append: false, offset: 0 });
	expect(logged).toHaveBeenCalledWith(expect.any(String), failure);
});

test('failed append retains loaded transfers and remembers the failed request', async () => {
	const { fetch, run } = modal(vi.fn().mockRejectedValue(new Error('fetch failed')));
	run(`transfers = [${JSON.stringify(previous)}]`);
	const loaded = run('transfers');
	await fetch(true);
	expect(run('transfers')).toBe(loaded);
	expect(run('error')).toBeTruthy();
	expect(run('failedRequest')).toEqual({ append: true, offset: 0 });
	expect(run('isLoading')).toBe(false);
});

test('unknown errors show fallback text and log the raw error', async () => {
	const raw = new Error('Unexpected token S');
	const { fetch, run, logged } = modal(vi.fn().mockRejectedValue(raw));
	await fetch();
	expect(run('error')).toBe("Couldn't load transfers right now. Please try again.");
	expect(run('error')).not.toContain(raw.message);
	expect(logged).toHaveBeenCalledWith(expect.any(String), raw);
});

test('failed ARC-200 scroll preserves offset and retry requests that same page', async () => {
	const load = vi.fn().mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValue(page);
	const { scroll, run } = modal(load);
	run(`transfers = [${JSON.stringify(previous)}]; offset = 50`);
	scroll();
	await vi.waitFor(() => expect(run('isLoading')).toBe(false));
	expect(run('offset')).toBe(50);
	expect(load.mock.calls[0][0]).toMatchObject({ offset: 100, append: true });
	expect(run('failedRequest')).toEqual({ append: true, offset: 100 });
	await run('retryTransfers()');
	expect(load).toHaveBeenCalledTimes(2);
	expect(load.mock.calls[1][0].offset).toBe(load.mock.calls[0][0].offset);
	expect(load.mock.calls[1][0].append).toBe(true);
	expect(run('offset')).toBe(100);
	expect(run('transfers')).toEqual([previous, ...page.transfers]);
	expect(run('failedRequest')).toBeNull();
});

test('successful ARC-200 scroll commits offset only after the request resolves', async () => {
	const pending = Promise.withResolvers<typeof page>();
	const { scroll, run, load } = modal(vi.fn().mockReturnValue(pending.promise));
	scroll();
	expect(load.mock.calls[0][0].offset).toBe(50);
	expect(run('offset')).toBe(0);
	pending.resolve(page);
	await vi.waitFor(() => expect(run('isLoading')).toBe(false));
	expect(run('offset')).toBe(50);
});

test('failure preserves hasMore even if onPagination reports the end before rejecting', async () => {
	const { fetch, run } = modal(
		vi.fn().mockImplementation(async ({ onPagination }) => {
			onPagination({ nextToken: 'cursor', hasMore: false });
			throw new Error('name lookup failed');
		})
	);
	await fetch();
	expect(run('hasMore')).toBe(true);
});

test('scroll waits for explicit retry while error is set', () => {
	const { scroll, run, load } = modal();
	run('error = "unavailable"');
	scroll();
	expect(load).not.toHaveBeenCalled();
	expect(run('offset')).toBe(0);
});

test('retry clears error before loading and reissues the failed first load', async () => {
	const load = vi.fn().mockRejectedValueOnce(new Error('fetch failed'));
	const { fetch, run } = modal(load);
	await fetch();
	load.mockImplementationOnce(() => {
		expect(run('error')).toBeNull();
		expect(run('isLoading')).toBe(true);
		return Promise.resolve(page);
	});
	await run('retryTransfers()');
	expect(load.mock.calls[1][0]).toMatchObject({ append: false, offset: 0 });
	expect(run('error')).toBeNull();
});

test('LP label retry clears loaded history and requests the first page', async () => {
	const { run, load } = modal();
	run(`transfers = [${JSON.stringify({ ...previous, lpLabelUnavailable: true })}]; offset = 100`);
	await run('retryLpLabels()');
	expect(load).toHaveBeenCalledWith(
		expect.objectContaining({ append: false, offset: 0, transfers: [] })
	);
	expect(run('transfers')).toEqual(page.transfers);
});

test('non-ARC-200 scrolling retains cursor pagination and offset', async () => {
	const { scroll, run, load } = modal();
	run('token.type = "vsa"; nextToken = "cursor"');
	scroll();
	await vi.waitFor(() => expect(run('isLoading')).toBe(false));
	expect(load).toHaveBeenCalledWith(
		expect.objectContaining({ append: true, nextToken: 'cursor', offset: 0, limit: 50 })
	);
	expect(run('offset')).toBe(0);
});
