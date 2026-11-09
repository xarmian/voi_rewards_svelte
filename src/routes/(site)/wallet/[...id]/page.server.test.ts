import { isValidAddress } from 'algosdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

const mocks = vi.hoisted(() => ({ lockvest: vi.fn(), resolveWalletName: vi.fn() }));
vi.mock('$lib/services/lockvest', () => ({ getLockContractByAddress: mocks.lockvest }));
vi.mock('$lib/server/walletName', () => ({ resolveWalletName: mocks.resolveWalletName }));

const address = 'G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ';
const fetch = vi.fn<typeof globalThis.fetch>();
const event = (id: string) =>
	({ params: { id }, depends: () => {}, url: new URL('http://x/wallet/' + id), fetch }) as never;

beforeEach(() => vi.resetAllMocks());

describe('wallet server load', () => {
	it('returns 404 for an address with a bad checksum without resolving a name', async () => {
		const badAddress = address.slice(0, -1) + 'A';
		expect(badAddress).toMatch(/^[A-Z2-7]{58}$/);
		expect(isValidAddress(badAddress)).toBe(false);
		mocks.resolveWalletName.mockResolvedValue({ kind: 'unavailable' });

		await expect(load(event(badAddress))).rejects.toMatchObject({
			status: 404,
			body: { message: `No wallet found for "${badAddress}"` }
		});
		expect(mocks.resolveWalletName).not.toHaveBeenCalled();
	});

	it('resolves a name and returns 404 when it is not found', async () => {
		mocks.resolveWalletName.mockResolvedValue({ kind: 'not-found' });

		await expect(load(event('alice.voi'))).rejects.toMatchObject({
			status: 404,
			body: { message: 'No wallet found for "alice.voi"' }
		});
		expect(mocks.resolveWalletName).toHaveBeenCalledWith('alice.voi', fetch);
	});

	it('returns 503 when name resolution is unavailable', async () => {
		mocks.resolveWalletName.mockResolvedValue({ kind: 'unavailable' });

		await expect(load(event('alice.voi'))).rejects.toMatchObject({ status: 503 });
		expect(mocks.resolveWalletName).toHaveBeenCalledWith('alice.voi', fetch);
	});

	it('redirects a resolved name to its wallet address', async () => {
		mocks.resolveWalletName.mockResolvedValue({ kind: 'address', address });

		await expect(load(event('alice.voi'))).rejects.toMatchObject({
			status: 307,
			location: '/wallet/' + address
		});
		expect(mocks.resolveWalletName).toHaveBeenCalledWith('alice.voi', fetch);
	});

	it('loads a valid address without resolving a name', async () => {
		expect(isValidAddress(address)).toBe(true);
		mocks.lockvest.mockResolvedValue({ global_owner: 'parent-wallet' });

		await expect(load(event(address))).resolves.toEqual({
			parentWalletId: 'parent-wallet',
			ownerLookup: 'ok'
		});
		expect(mocks.lockvest).toHaveBeenCalledWith(address);
		expect(mocks.resolveWalletName).not.toHaveBeenCalled();
	});
});
