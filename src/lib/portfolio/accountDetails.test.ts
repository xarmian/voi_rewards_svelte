import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	loadAccountDetails,
	snapshotFromAlgodAccount,
	totalRewardsMicroVoi,
	type RewardsTransaction
} from './accountDetails';

const rawAccount = {
	amount: 121614513500n,
	status: 'Online',
	minBalance: 100000n,
	pendingRewards: 1234567n,
	rewards: 9876543,
	round: 10000000n,
	participation: { voteLastValid: 11000000n }
};
const snapshot = {
	balance: 121614513500,
	status: 'Online',
	minBalance: 100000,
	pendingRewards: 1234567,
	round: 10000000,
	voteLastValid: 11000000
};
const transactions: RewardsTransaction[] = [
	{ sender: 'rewards', confirmedRound: 1520000, paymentTransaction: { amount: 2000000 } }
];

function dependencies() {
	return {
		fetchAccount: vi.fn().mockResolvedValue(rawAccount),
		lookupCreatedAt: vi.fn().mockResolvedValue(1700000000),
		fetchRewardsTransactions: vi.fn().mockResolvedValue(transactions)
	};
}

describe('loadAccountDetails', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test('publishes the account before hung indexer parts time out, in settle order', async () => {
		vi.useFakeTimers();
		const deps = dependencies();
		deps.lookupCreatedAt.mockImplementation(() => new Promise(() => {}));
		deps.fetchRewardsTransactions.mockImplementation(() => new Promise(() => {}));
		const onPart = vi.fn();
		const completed = vi.fn();
		const loading = loadAccountDetails('wallet', deps, { onPart, timeoutMs: 50 });
		void loading.then(completed);

		await vi.advanceTimersByTimeAsync(0);
		for (const dependency of Object.values(deps)) {
			expect(dependency).toHaveBeenCalledExactlyOnceWith('wallet');
		}
		expect(onPart.mock.calls).toEqual([['account', { status: 'loaded', value: snapshot }]]);
		expect(completed).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(50);
		const result = await loading;
		expect(result.createdAt).toEqual({ status: 'unavailable', error: 'timed out after 0.05s' });
		expect(result.rewards).toEqual({ status: 'unavailable', error: 'timed out after 0.05s' });
		expect(onPart.mock.calls).toEqual([
			['account', result.account],
			['createdAt', result.createdAt],
			['rewards', result.rewards]
		]);
	});

	test('publishes each returned part once in settle order even if the callback throws', async () => {
		vi.useFakeTimers();
		const account = Promise.withResolvers<Record<string, unknown>>();
		const createdAt = Promise.withResolvers<number>();
		const rewards = Promise.withResolvers<RewardsTransaction[]>();
		const deps = {
			fetchAccount: () => account.promise,
			lookupCreatedAt: () => createdAt.promise,
			fetchRewardsTransactions: () => rewards.promise
		};
		const onPart = vi.fn(() => {
			throw new Error('callback failed');
		});
		const loading = loadAccountDetails('wallet', deps, { onPart });
		createdAt.reject(new Error('indexer down'));
		await vi.advanceTimersByTimeAsync(0);
		account.resolve(rawAccount);
		await vi.advanceTimersByTimeAsync(0);
		rewards.resolve(transactions);
		const result = await loading;

		expect(onPart.mock.calls).toEqual([
			['createdAt', result.createdAt],
			['account', result.account],
			['rewards', result.rewards]
		]);
		expect(result.account).toEqual({ status: 'loaded', value: snapshot });
		expect(result.createdAt).toEqual({ status: 'unavailable', error: 'indexer down' });
		expect(result.rewards).toEqual({ status: 'loaded', value: transactions });
	});

	test('ignores a dependency settling after its timeout', async () => {
		vi.useFakeTimers();
		const deps = dependencies();
		const createdAt = Promise.withResolvers<number>();
		deps.lookupCreatedAt.mockImplementation(() => createdAt.promise);
		const onPart = vi.fn();
		const loading = loadAccountDetails('wallet', deps, { onPart, timeoutMs: 50 });
		await vi.advanceTimersByTimeAsync(50);
		expect(onPart).toHaveBeenCalledTimes(3);
		const result = await loading;
		const calls = [...onPart.mock.calls];
		expect(result.createdAt).toEqual({ status: 'unavailable', error: 'timed out after 0.05s' });

		createdAt.resolve(1700000000);
		await vi.advanceTimersByTimeAsync(0);
		expect(result.createdAt).toEqual({ status: 'unavailable', error: 'timed out after 0.05s' });
		expect(onPart.mock.calls).toEqual(calls);
	});

	test('clears every timeout when all dependencies settle in time', async () => {
		vi.useFakeTimers();
		const result = await loadAccountDetails('wallet', dependencies());
		expect(result.account.status).toBe('loaded');
		expect(result.createdAt.status).toBe('loaded');
		expect(result.rewards.status).toBe('loaded');
		expect(vi.getTimerCount()).toBe(0);
	});

	test.each([
		[undefined, 15000, '15s'],
		[15000, 15000, '15s'],
		[50, 50, '0.05s']
	])('formats timeout %s as %s milliseconds / %s', async (timeoutMs, elapsed, seconds) => {
		vi.useFakeTimers();
		const deps = dependencies();
		deps.fetchAccount.mockImplementation(() => new Promise(() => {}));
		const onPart = vi.fn();
		const loading = loadAccountDetails('wallet', deps, { onPart, timeoutMs });
		await vi.advanceTimersByTimeAsync(elapsed);
		expect(onPart).toHaveBeenCalledWith('account', {
			status: 'unavailable',
			error: `timed out after ${seconds}`
		});
		expect((await loading).account).toEqual({
			status: 'unavailable',
			error: `timed out after ${seconds}`
		});
	});

	test('keeps the real algod balance when both indexer lookups fail', async () => {
		const deps = dependencies();
		deps.lookupCreatedAt.mockRejectedValue(new Error('fetch failed'));
		deps.fetchRewardsTransactions.mockRejectedValue(new Error('fetch failed'));

		const result = await loadAccountDetails('wallet', deps);

		expect(result.account).toEqual({ status: 'loaded', value: snapshot });
		for (const part of [result.createdAt, result.rewards]) {
			expect(part).toEqual({ status: 'unavailable', error: 'fetch failed' });
			expect(part).not.toHaveProperty('value');
		}
	});

	test('keeps indexer history when algod fails, without a snapshot or balance', async () => {
		const deps = dependencies();
		deps.fetchAccount.mockRejectedValue(new Error('algod down'));

		const result = await loadAccountDetails('wallet', deps);

		expect(result.account).toEqual({ status: 'unavailable', error: 'algod down' });
		expect(result.account).not.toHaveProperty('value');
		expect(result.account).not.toHaveProperty('balance');
		expect(result.createdAt).toEqual({ status: 'loaded', value: 1700000000 });
		expect(result.rewards).toEqual({ status: 'loaded', value: transactions });
	});

	test('resolves with three unavailable parts when everything fails', async () => {
		const deps = dependencies();
		for (const dependency of Object.values(deps)) {
			dependency.mockRejectedValue(new Error('offline'));
		}
		await expect(loadAccountDetails('wallet', deps)).resolves.toEqual({
			account: { status: 'unavailable', error: 'offline' },
			createdAt: { status: 'unavailable', error: 'offline' },
			rewards: { status: 'unavailable', error: 'offline' }
		});
	});

	test('starts all three requests before any of them resolves', async () => {
		const account = Promise.withResolvers<Record<string, unknown>>();
		const createdAt = Promise.withResolvers<number>();
		const rewards = Promise.withResolvers<RewardsTransaction[]>();
		const deps = {
			fetchAccount: vi.fn(() => account.promise),
			lookupCreatedAt: vi.fn(() => createdAt.promise),
			fetchRewardsTransactions: vi.fn(() => rewards.promise)
		};

		const loading = loadAccountDetails('wallet', deps);
		for (const dependency of Object.values(deps)) {
			expect(dependency).toHaveBeenCalledExactlyOnceWith('wallet');
		}
		account.resolve(rawAccount);
		createdAt.resolve(1700000000);
		rewards.resolve(transactions);
		await expect(loading).resolves.toEqual({
			account: { status: 'loaded', value: snapshot },
			createdAt: { status: 'loaded', value: 1700000000 },
			rewards: { status: 'loaded', value: transactions }
		});
	});

	test('uses String for a non-Error rejection', async () => {
		const deps = dependencies();
		deps.lookupCreatedAt.mockRejectedValue(503);
		expect((await loadAccountDetails('wallet', deps)).createdAt).toEqual({
			status: 'unavailable',
			error: '503'
		});
	});

	test('settles synchronous dependency throws independently', async () => {
		const deps = dependencies();
		deps.fetchAccount.mockImplementation(() => {
			throw new Error('synchronous failure');
		});
		const result = await loadAccountDetails('wallet', deps);
		expect(result.account).toEqual({ status: 'unavailable', error: 'synchronous failure' });
		expect(result.createdAt.status).toBe('loaded');
		expect(result.rewards.status).toBe('loaded');
	});

	test('makes malformed algod data unavailable instead of returning NaN', async () => {
		const deps = dependencies();
		deps.fetchAccount.mockResolvedValue({ ...rawAccount, amount: 'abc' });
		const result = await loadAccountDetails('wallet', deps);
		expect(result.account).toEqual({
			status: 'unavailable',
			error: expect.stringMatching(/^Invalid account/)
		});
		expect(result.account).not.toHaveProperty('value');
		expect(result.createdAt.status).toBe('loaded');
		expect(result.rewards.status).toBe('loaded');
	});
});

describe('snapshotFromAlgodAccount', () => {
	test('maps the raw kebab-case algod fields, including pending rather than accrued rewards', () => {
		expect(snapshotFromAlgodAccount(rawAccount)).toEqual(snapshot);
	});

	test('omits voteLastValid without participation', () => {
		const offline: Record<string, unknown> = { ...rawAccount, status: 'Offline' };
		delete offline.participation;
		expect(snapshotFromAlgodAccount(offline)).toEqual({
			balance: snapshot.balance,
			status: 'Offline',
			minBalance: snapshot.minBalance,
			pendingRewards: snapshot.pendingRewards,
			round: snapshot.round
		});
	});

	test.each([
		['missing amount', { amount: undefined }],
		['negative amount', { amount: -1 }],
		['NaN amount', { amount: NaN }],
		['infinite amount', { amount: Infinity }],
		['unsafe bigint amount', { amount: 2n ** 60n }],
		['string amount', { amount: '100' }],
		['empty status', { status: '' }],
		['missing status', { status: undefined }],
		['missing minimum balance', { minBalance: undefined }],
		['string minimum balance', { minBalance: '100' }],
		['NaN minimum balance', { minBalance: NaN }],
		['missing pending rewards', { pendingRewards: undefined }],
		['string pending rewards', { pendingRewards: '100' }],
		['infinite pending rewards', { pendingRewards: Infinity }],
		['non-numeric round', { round: '100' }],
		['NaN round', { round: NaN }]
	])('rejects %s', (_label, fields) => {
		expect(() => snapshotFromAlgodAccount({ ...rawAccount, ...fields })).toThrow(
			/^Invalid account/
		);
	});

	test('accepts real zero balances and rewards', () => {
		expect(
			snapshotFromAlgodAccount({
				...rawAccount,
				amount: 0,
				minBalance: 0,
				pendingRewards: 0
			})
		).toMatchObject({ balance: 0, minBalance: 0, pendingRewards: 0 });
	});
});

describe('totalRewardsMicroVoi', () => {
	test('skips rounds before 1520000 and non-payments, summing payment amounts', () => {
		expect(
			totalRewardsMicroVoi([
				{ sender: 'r', confirmedRound: 1519999, paymentTransaction: { amount: 999 } },
				{ sender: 'r', confirmedRound: 1520000, paymentTransaction: { amount: 100 } },
				{ sender: 'r', confirmedRound: 1520001 },
				{ sender: 'r', confirmedRound: 1520002, paymentTransaction: { amount: 200 } }
			])
		).toBe(300);
	});

	test('returns zero for a successfully loaded empty history', () => {
		expect(totalRewardsMicroVoi([])).toBe(0);
	});
});
