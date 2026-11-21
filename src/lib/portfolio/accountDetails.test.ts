import { afterEach, describe, expect, test, vi } from 'vitest';
import { loadAccountDetails, snapshotFromAlgodAccount } from './accountDetails';

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

function dependencies() {
	return {
		fetchAccount: vi.fn().mockResolvedValue(rawAccount)
	};
}

describe('loadAccountDetails', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test('resolves the loaded snapshot, notifies onAccount, and clears its timer', async () => {
		vi.useFakeTimers();
		const deps = dependencies();
		const onAccount = vi.fn();
		const result = await loadAccountDetails('wallet', deps, { onAccount });

		expect(result).toEqual({ status: 'loaded', value: snapshot });
		expect(deps.fetchAccount).toHaveBeenCalledExactlyOnceWith('wallet');
		expect(onAccount).toHaveBeenCalledExactlyOnceWith(result);
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
		const onAccount = vi.fn();
		const loading = loadAccountDetails('wallet', deps, { onAccount, timeoutMs });
		await vi.advanceTimersByTimeAsync(elapsed);
		const expected = {
			status: 'unavailable',
			error: `timed out after ${seconds}`
		};
		expect(onAccount).toHaveBeenCalledExactlyOnceWith(expected);
		expect(await loading).toEqual(expected);
	});

	test('ignores a fetchAccount resolving after its timeout', async () => {
		vi.useFakeTimers();
		const deps = dependencies();
		const account = Promise.withResolvers<Record<string, unknown>>();
		deps.fetchAccount.mockImplementation(() => account.promise);
		const onAccount = vi.fn();
		const loading = loadAccountDetails('wallet', deps, { onAccount, timeoutMs: 50 });
		await vi.advanceTimersByTimeAsync(50);
		const result = await loading;
		expect(onAccount).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ status: 'unavailable', error: 'timed out after 0.05s' });

		account.resolve(rawAccount);
		await vi.advanceTimersByTimeAsync(0);
		expect(result).toEqual({ status: 'unavailable', error: 'timed out after 0.05s' });
		expect(onAccount).toHaveBeenCalledTimes(1);
	});

	test('resolves the loaded result even if onAccount throws', async () => {
		const deps = dependencies();
		const onAccount = vi.fn(() => {
			throw new Error('callback failed');
		});
		const result = await loadAccountDetails('wallet', deps, { onAccount });

		expect(result).toEqual({ status: 'loaded', value: snapshot });
		expect(onAccount).toHaveBeenCalledExactlyOnceWith(result);
	});

	test('makes algod failure unavailable without a value property', async () => {
		const deps = dependencies();
		deps.fetchAccount.mockRejectedValue(new Error('algod down'));

		const result = await loadAccountDetails('wallet', deps);

		expect(result).toEqual({ status: 'unavailable', error: 'algod down' });
		expect(result).not.toHaveProperty('value');
	});

	test('uses String for a non-Error rejection', async () => {
		const deps = dependencies();
		deps.fetchAccount.mockRejectedValue(503);

		expect(await loadAccountDetails('wallet', deps)).toEqual({
			status: 'unavailable',
			error: '503'
		});
	});

	test('handles a synchronous throw from fetchAccount', async () => {
		const deps = dependencies();
		deps.fetchAccount.mockImplementation(() => {
			throw new Error('synchronous failure');
		});

		const result = await loadAccountDetails('wallet', deps);

		expect(result).toEqual({ status: 'unavailable', error: 'synchronous failure' });
	});

	test('makes malformed algod data unavailable instead of returning NaN', async () => {
		const deps = dependencies();
		deps.fetchAccount.mockResolvedValue({ ...rawAccount, amount: 'abc' });

		const result = await loadAccountDetails('wallet', deps);

		expect(result).toEqual({
			status: 'unavailable',
			error: expect.stringMatching(/^Invalid account/)
		});
		expect(result).not.toHaveProperty('value');
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
