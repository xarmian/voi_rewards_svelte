import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { dataTable } from './dataTable';

vi.mock('$lib/config', () => ({ config: { proposalApiBaseUrl: 'https://test.invalid' } }));
const range = '20241030-20241105';
const otherRange = '20241106-20241112';

beforeEach(() => {
	dataTable.clearCache();
	vi.useFakeTimers();
	vi.stubGlobal('fetch', vi.fn());
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it('TASK-30 shares a slow request without returning undefined after five seconds', async () => {
	let resolve!: (response: Response) => void;
	vi.mocked(fetch).mockImplementation(() => new Promise((done) => (resolve = done)));
	const first = dataTable.fetchData(range);
	const second = dataTable.fetchData(range);
	await vi.advanceTimersByTimeAsync(6000);
	expect(fetch).toHaveBeenCalledTimes(1);
	resolve(Response.json([{ reward: 1 }]));
	expect(await Promise.all([first, second])).toEqual([[{ reward: 1 }], [{ reward: 1 }]]);
	expect(get(dataTable).loading).toBe(false);
});

it('fetches different ranges in parallel and stays loading until both settle', async () => {
	const resolvers: ((response: Response) => void)[] = [];
	vi.mocked(fetch).mockImplementation(() => new Promise((done) => resolvers.push(done)));
	const first = dataTable.fetchData(range);
	const second = dataTable.fetchData(otherRange);
	await Promise.resolve();
	expect(fetch).toHaveBeenCalledTimes(2);
	resolvers[0](Response.json([1]));
	await first;
	expect(get(dataTable).loading).toBe(true);
	resolvers[1](Response.json([2]));
	await second;
	expect(get(dataTable).loading).toBe(false);
	expect(get(dataTable).currentRange).toBe(otherRange);
});

it('throws HTTP failures without caching them and clears error after retry', async () => {
	vi.mocked(fetch)
		.mockResolvedValueOnce(Response.json({ error: 'bad' }, { status: 500 }))
		.mockResolvedValueOnce(Response.json([1]));
	await expect(dataTable.fetchData(range)).rejects.toThrow('500');
	expect(get(dataTable).data).toEqual({});
	expect(get(dataTable).error).toBeTruthy();
	expect(await dataTable.fetchData(range)).toEqual([1]);
	expect(get(dataTable).error).toBeNull();
	expect(fetch).toHaveBeenCalledTimes(2);
});

it('dedupes date range fetches (including force) and retries HTTP failures', async () => {
	vi.mocked(fetch)
		.mockResolvedValueOnce(Response.json({ error: 'bad' }, { status: 503 }))
		.mockResolvedValue(Response.json({ max_timestamp: '2024-11-01T00:00:00Z' }));
	await expect(dataTable.fetchDateRanges()).rejects.toThrow('503');
	expect(get(dataTable).dateRanges).toBeNull();
	const [first, second] = await Promise.all([
		dataTable.fetchDateRanges(),
		dataTable.fetchDateRanges(true)
	]);
	expect(first).toEqual(second);
	expect(first).toHaveLength(1);
	expect(fetch).toHaveBeenCalledTimes(2);
});

it('keeps the five minute expiry for data and date ranges', async () => {
	vi.mocked(fetch).mockImplementation(async (url) =>
		Response.json(String(url).includes('?') ? [1] : { max_timestamp: '2024-11-01T00:00:00Z' })
	);
	await dataTable.fetchData(range);
	await dataTable.fetchDateRanges();
	await vi.advanceTimersByTimeAsync(299_999);
	await dataTable.fetchData(range);
	await dataTable.fetchDateRanges();
	expect(fetch).toHaveBeenCalledTimes(2);
	await vi.advanceTimersByTimeAsync(1);
	await dataTable.fetchData(range);
	await dataTable.fetchDateRanges();
	expect(fetch).toHaveBeenCalledTimes(4);
});

it.each(['data', 'dates'])(
	'clearCache detaches pending %s requests and prevents resurrection',
	async (kind) => {
		let resolve!: (response: Response) => void;
		vi.mocked(fetch)
			.mockImplementationOnce(() => new Promise((done) => (resolve = done)))
			.mockImplementation(async () =>
				Response.json(kind === 'data' ? [2] : { max_timestamp: '2024-11-01' })
			);
		const run = () => (kind === 'data' ? dataTable.fetchData(range) : dataTable.fetchDateRanges());
		const old = run();
		await Promise.resolve();
		dataTable.clearCache();
		const fresh = await run();
		resolve(Response.json(kind === 'data' ? [1] : { max_timestamp: '2025-01-01' }));
		await old;
		expect(await run()).toEqual(fresh);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(get(dataTable).loading).toBe(false);
	}
);

it('builds legacy ids, descriptions and epoch numbers matching every epoch range', async () => {
	const { buildDateRanges } = await import('./dataTable');
	const { epochRange } = await import('$lib/epochs');
	const dates = buildDateRanges(new Date('2026-10-25T02:38:00Z'));
	expect(dates).toHaveLength(104);
	expect(dates[0]).toEqual({ id: '20241030-20241105', desc: '2024-10-30 to 2024-11-05', epoch: 1 });
	expect(dates[103]).toEqual({
		id: '20261021-20261027',
		desc: '2026-10-21 to 2026-10-27',
		epoch: 104
	});
	for (const date of dates) expect(date.id).toBe(epochRange(date.epoch).id);
});
