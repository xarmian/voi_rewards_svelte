import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	ACCOUNT_CACHE_TTL,
	accountInfo,
	clearCaches,
	consensusInfo,
	getAccountInfo,
	getConsensusInfo,
	getSupplyInfo,
	supply
} from './accounts';

const mocks = vi.hoisted(() => ({ account: vi.fn(), supply: vi.fn() }));
vi.mock('$lib/utils/algod', () => ({
	algodClient: {
		accountInformation: mocks.account,
		supply: mocks.supply
	}
}));
vi.mock('$lib/config', () => ({ config: { proposalApiBaseUrl: 'https://test.invalid' } }));
vi.mock('$lib/utils/nfd', () => ({ getNFD: vi.fn() }));

beforeEach(() => {
	clearCaches();
	vi.useFakeTimers();
	vi.setSystemTime(1000);
	mocks.account.mockReset().mockReturnValue({ do: vi.fn().mockResolvedValue({ amount: 100 }) });
	mocks.supply
		.mockReset()
		.mockReturnValue({ do: vi.fn().mockResolvedValue({ 'online-money': 200 }) });
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ blacklist_balance_total: '50' }))
	);
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it('TASK-30 shares concurrent account lookups and updates the store', async () => {
	const values = await Promise.all([getAccountInfo('X'), getAccountInfo('X')]);
	expect(mocks.account).toHaveBeenCalledTimes(1);
	expect(values).toEqual([{ amount: 100 }, { amount: 100 }]);
	expect(get(accountInfo).X).toEqual(values[0]);
});

it('expires accounts after 30s and allows forced refreshes', async () => {
	await getAccountInfo('X');
	vi.setSystemTime(1000 + 30_000 - 1);
	await getAccountInfo('X');
	expect(mocks.account).toHaveBeenCalledTimes(1);
	vi.setSystemTime(1000 + 30_000);
	await getAccountInfo('X');
	await getAccountInfo('X', true);
	expect(mocks.account).toHaveBeenCalledTimes(3);
	expect(Object.isFrozen(ACCOUNT_CACHE_TTL)).toBe(true);
	expect(ACCOUNT_CACHE_TTL).toEqual({ account: 30_000, consensus: 30_000, supply: 300_000 });
});

it('does not cache account failures', async () => {
	mocks.account.mockReturnValueOnce({ do: vi.fn().mockRejectedValue(new Error('offline')) });
	expect(await getAccountInfo('X')).toBeUndefined();
	expect(await getAccountInfo('X')).toEqual({ amount: 100 });
	expect(mocks.account).toHaveBeenCalledTimes(2);
});

it('TASK-30 returns the stale account after an expired algod request rejects and retries next time', async () => {
	const previous = await getAccountInfo('X');
	vi.setSystemTime(1000 + ACCOUNT_CACHE_TTL.account);
	mocks.account.mockReturnValueOnce({ do: vi.fn().mockRejectedValue(new Error('offline')) });
	expect(await getAccountInfo('X')).toBe(previous);
	expect(get(accountInfo).X).toBe(previous);
	await getAccountInfo('X');
	expect(mocks.account).toHaveBeenCalledTimes(3);
});

it('TASK-30 returns the stale supply after an expired algod request rejects and retries next time', async () => {
	const previous = await getSupplyInfo();
	vi.setSystemTime(1000 + ACCOUNT_CACHE_TTL.supply);
	mocks.supply.mockReturnValueOnce({ do: vi.fn().mockRejectedValue(new Error('offline')) });
	expect(await getSupplyInfo()).toBe(previous);
	expect(get(supply)).toBe(previous);
	await getSupplyInfo();
	expect(mocks.supply).toHaveBeenCalledTimes(3);
});

it('TASK-30 only publishes the newest forced account result', async () => {
	let resolve!: (value: { amount: number }) => void;
	mocks.account.mockReturnValueOnce({ do: () => new Promise((done) => (resolve = done)) });
	const older = getAccountInfo('X');
	await Promise.resolve();
	const forced = getAccountInfo('X', true);
	// TASK-30: settle the newer fetch before the old response can overwrite the public store.
	await vi.advanceTimersByTimeAsync(0);
	resolve({ amount: 1 });
	await Promise.all([older, forced]);
	expect(mocks.account).toHaveBeenCalledTimes(2);
	expect(get(accountInfo).X).toEqual({ amount: 100 });
	expect(await getAccountInfo('X')).toEqual({ amount: 100 });
});

it('shares supply and blacklist requests, expires supply, and retries failures', async () => {
	const values = await Promise.all([getSupplyInfo(), getSupplyInfo()]);
	expect(mocks.supply).toHaveBeenCalledTimes(1);
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(values[0]).toEqual({ 'online-money': 200, 'blacklisted-money': 50 });
	expect(get(supply)).toEqual(values[0]);
	vi.setSystemTime(1000 + 300_000);
	vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
	expect(await getSupplyInfo()).toBe(values[0]);
	await getSupplyInfo();
	expect(mocks.supply).toHaveBeenCalledTimes(3);
});

it('shares consensus requests, respects TTL and force, and retries HTTP failures', async () => {
	vi.mocked(fetch).mockImplementation(async () => Response.json({ vote_count: 3 }));
	const values = await Promise.all([getConsensusInfo('X'), getConsensusInfo('X')]);
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(get(consensusInfo).X).toEqual(values[0]);
	await getConsensusInfo('X');
	expect(fetch).toHaveBeenCalledTimes(1);
	vi.setSystemTime(31_000);
	await getConsensusInfo('X');
	vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
	expect(await getConsensusInfo('X', true)).toEqual(values[0]);
	vi.setSystemTime(61_000);
	await getConsensusInfo('X');
	expect(fetch).toHaveBeenCalledTimes(4);
});

it('clearCaches invalidates pending and completed account results', async () => {
	let resolve!: (value: { amount: number }) => void;
	mocks.account.mockReturnValueOnce({ do: () => new Promise((done) => (resolve = done)) });
	const pending = getAccountInfo('X');
	await Promise.resolve();
	clearCaches();
	resolve({ amount: 1 });
	await pending;
	expect(get(accountInfo)).toEqual({});
	await getAccountInfo('X');
	clearCaches();
	await getAccountInfo('X');
	expect(mocks.account).toHaveBeenCalledTimes(3);
});
