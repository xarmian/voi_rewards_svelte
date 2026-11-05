import { describe, expect, test, vi } from 'vitest';
import { loadRecipientInfo, tokenKey, type RecipientInfoDeps } from './recipientInfo';

test.each([
	[{ type: 'native' }, 'native'],
	[{ type: 'native', id: '0' }, 'native'],
	[{ type: 'vsa', id: 7 }, 'vsa:7'],
	[{ type: 'arc200', id: '7' }, 'arc200:7'],
	// FungibleTokenType.type is optional: untyped tokens still get a distinct key per id.
	[{ id: '7' }, 'undefined:7'],
	[{ id: '8' }, 'undefined:8']
] as const)('tokenKey identifies %o as %s', (token, key) => {
	expect(tokenKey(token)).toBe(key);
});

const rawAccount = {
	amount: 123456789n,
	status: 'Offline',
	minBalance: 100000n,
	pendingRewards: 0n,
	round: 10000000
};

function dependencies() {
	return {
		fetchAccount: vi.fn().mockResolvedValue(rawAccount),
		arc200BalanceOf: vi.fn().mockResolvedValue({ success: true, returnValue: '42' })
	} satisfies RecipientInfoDeps;
}

describe('loadRecipientInfo', () => {
	test('loads the real native balance without calling the ARC-200 contract', async () => {
		const deps = dependencies();
		await expect(loadRecipientInfo('wallet', { kind: 'native' }, deps)).resolves.toEqual({
			status: 'loaded',
			info: { balance: Number(rawAccount.amount), hasOptedIn: false, assetBalance: 0 }
		});
		expect(deps.fetchAccount).toHaveBeenCalledExactlyOnceWith('wallet');
		expect(deps.arc200BalanceOf).not.toHaveBeenCalled();
	});

	test('loads the VSA holding amount and real algod balance', async () => {
		const deps = dependencies();
		deps.fetchAccount.mockResolvedValue({
			...rawAccount,
			assets: [
				{ assetId: 2n, amount: 999n },
				{ assetId: 7n, amount: 123n }
			]
		});
		await expect(loadRecipientInfo('wallet', { kind: 'vsa', assetId: 7 }, deps)).resolves.toEqual({
			status: 'loaded',
			info: { balance: Number(rawAccount.amount), hasOptedIn: true, assetBalance: 123 }
		});
		expect(deps.arc200BalanceOf).not.toHaveBeenCalled();
	});

	test.each([undefined, [], [{ assetId: 2n, amount: 999n }]])(
		'loads a real VSA not-opted-in answer with assets %o',
		async (assets) => {
			const deps = dependencies();
			deps.fetchAccount.mockResolvedValue({
				...rawAccount,
				...(assets === undefined ? {} : { assets })
			});
			await expect(loadRecipientInfo('wallet', { kind: 'vsa', assetId: 7 }, deps)).resolves.toEqual(
				{
					status: 'loaded',
					info: { balance: Number(rawAccount.amount), hasOptedIn: false, assetBalance: 0 }
				}
			);
		}
	);

	test('makes an algod rejection unavailable without fabricating recipient info', async () => {
		const deps = dependencies();
		deps.fetchAccount.mockRejectedValue(new Error('algod offline'));
		const result = await loadRecipientInfo('wallet', { kind: 'native' }, deps);
		expect(result).toEqual({ status: 'unavailable', error: 'algod offline' });
		expect(result).not.toHaveProperty('info');
		expect(deps.arc200BalanceOf).not.toHaveBeenCalled();
	});

	test.each([
		{ amount: 'abc' },
		{ assets: 'x' },
		{ assets: null },
		...['abc', '123', -1, NaN, Infinity].map((amount) => ({
			assets: [{ assetId: 7n, amount }]
		}))
	])('makes malformed algod fields %o unavailable without a balance', async (fields) => {
		const deps = dependencies();
		deps.fetchAccount.mockResolvedValue({ ...rawAccount, ...fields });
		const result = await loadRecipientInfo('wallet', { kind: 'vsa', assetId: 7 }, deps);
		expect(result).toEqual({
			status: 'unavailable',
			error: expect.stringMatching(/^Invalid account/)
		});
		expect(result).not.toHaveProperty('info');
	});

	test.each(['native', 'arc200'] as const)('rejects malformed assets for %s too', async (kind) => {
		const deps = dependencies();
		deps.fetchAccount.mockResolvedValue({ ...rawAccount, assets: 'x' });
		const result = await loadRecipientInfo('wallet', { kind }, deps);
		expect(result.status).toBe('unavailable');
		expect(result).not.toHaveProperty('info');
		expect(deps.arc200BalanceOf).not.toHaveBeenCalled();
	});

	test.each(['42', 0n])(
		'loads a successful ARC-200 balance %s as a number',
		async (returnValue) => {
			const deps = dependencies();
			deps.arc200BalanceOf.mockResolvedValue({ success: true, returnValue });
			await expect(loadRecipientInfo('wallet', { kind: 'arc200' }, deps)).resolves.toEqual({
				status: 'loaded',
				info: { balance: Number(rawAccount.amount), hasOptedIn: true, assetBalance: Number(returnValue) }
			});
			expect(deps.arc200BalanceOf).toHaveBeenCalledExactlyOnceWith('wallet');
		}
	);

	test('makes an ARC-200 rejection unavailable instead of reporting zero', async () => {
		const deps = dependencies();
		deps.arc200BalanceOf.mockRejectedValue(new Error('contract offline'));
		await expect(loadRecipientInfo('wallet', { kind: 'arc200' }, deps)).resolves.toEqual({
			status: 'unavailable',
			error: 'contract offline'
		});
	});

	test.each([
		{ success: false, returnValue: 42 },
		{ success: 'true', returnValue: 42 },
		...['abc', -1, NaN, Infinity, Symbol('invalid')].map((returnValue) => ({
			success: true,
			returnValue
		}))
	])('makes an invalid ARC-200 response %o unavailable', async (response) => {
		const deps = dependencies();
		deps.arc200BalanceOf.mockResolvedValue(response);
		const result = await loadRecipientInfo('wallet', { kind: 'arc200' }, deps);
		expect(result).toEqual({ status: 'unavailable', error: expect.any(String) });
		expect(result).not.toHaveProperty('info');
	});

	test.each(['fetchAccount', 'arc200BalanceOf'] as const)(
		'resolves non-Error rejections from %s using String',
		async (dependency) => {
			const deps = dependencies();
			deps[dependency].mockRejectedValue(503);
			await expect(loadRecipientInfo('wallet', { kind: 'arc200' }, deps)).resolves.toEqual({
				status: 'unavailable',
				error: '503'
			});
		}
	);

	test('resolves synchronous dependency throws as unavailable', async () => {
		const deps = dependencies();
		deps.fetchAccount.mockImplementation(() => {
			throw new Error('synchronous failure');
		});
		await expect(loadRecipientInfo('wallet', { kind: 'native' }, deps)).resolves.toEqual({
			status: 'unavailable',
			error: 'synchronous failure'
		});
	});
});
