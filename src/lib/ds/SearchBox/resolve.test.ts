import { describe, test } from 'vitest';
import { encodeAddress } from 'algosdk';
import assert from 'node:assert/strict';
import { createResolver, isAddress } from './resolve';
const address = 'G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ';
function memory(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		}
	};
}
const search = async () => [
	{ address, name: 'name.voi', metadata: { avatar: '/avatar.png' }, cached: true }
];
describe('resolution', () => {
	test('addresses use trimmed checksum validation', () => {
		assert.equal(isAddress(address), true);
		assert.equal(isAddress('A'.repeat(57)), false);
		assert.equal(isAddress(` ${address} `), true);
	});
	test('picked suggestion, raw address, and lookup resolve to an address', async () => {
		const resolver = createResolver({ search, lookup: async () => [address], storage: memory() });
		assert.deepEqual(await resolver.resolve('picked', { address, name: 'name.voi' }), {
			ok: true,
			address
		});
		assert.deepEqual(await resolver.resolve(` ${address} `), { ok: true, address });
		assert.deepEqual(await resolver.resolve('name.voi'), { ok: true, address });
		assert.deepEqual(await resolver.suggest('name'), [
			{ address, name: 'name.voi', avatar: '/avatar.png' }
		]);
	});
	test('missing and rejected lookup return inline failure text', async () => {
		for (const lookup of [
			async () => [],
			async (): Promise<string[]> => {
				throw new Error('offline');
			}
		]) {
			const resolver = createResolver({ search, lookup, storage: memory() });
			assert.deepEqual(await resolver.resolve(' nobody.voi '), {
				ok: false,
				message: 'No wallet found for "nobody.voi"'
			});
		}
	});
	test('malformed lookup addresses cannot reach the wallet route', async () => {
		const resolver = createResolver({ lookup: async () => ['short'], storage: memory() });
		assert.equal((await resolver.resolve('bad.voi')).ok, false);
	});
	test('empty input asks for a wallet without calling lookup', async () => {
		let lookups = 0;
		const resolver = createResolver({
			lookup: async () => {
				lookups++;
				return [address];
			},
			storage: memory()
		});
		for (const input of ['', ' \t\n ']) {
			assert.deepEqual(await resolver.resolve(input), {
				ok: false,
				message: 'Enter a wallet address or enVoi name'
			});
		}
		assert.deepEqual(await resolver.resolve('', { address }), { ok: true, address });
		assert.equal(lookups, 0);
	});
});
describe('recent wallets', () => {
	test('caps at five, newest first, without duplicates', () => {
		const resolver = createResolver({ storage: memory() });
		const addresses = Array.from({ length: 6 }, (_, i) =>
			encodeAddress(new Uint8Array(32).fill(i))
		);
		for (const address of addresses) resolver.remember(address);
		resolver.remember(addresses[3]);
		assert.deepEqual(
			resolver.recents(),
			[3, 5, 4, 2, 1].map((i) => addresses[i])
		);
	});
	test('seeds legacy only once, even across resolver instances', () => {
		const storage = memory({ searchText: address });
		assert.deepEqual(createResolver({ storage }).recents(), [address]);
		storage.setItem('ds-recent-wallets', '[]');
		assert.deepEqual(createResolver({ storage }).recents(), []);
	});
	test('unavailable and malformed storage never crash', () => {
		const storage = {
			getItem: () => {
				throw new Error('private');
			},
			setItem: () => {
				throw new Error('private');
			}
		};
		const resolver = createResolver({ storage });
		assert.deepEqual(resolver.recents(), []);
		assert.doesNotThrow(() => resolver.remember(address));
		assert.deepEqual(
			createResolver({ storage: memory({ 'ds-recent-wallets': '{' }) }).recents(),
			[]
		);
	});
});

for (const example of [address, 'R7TBR3Y5QCM6Y2OPQP3BPNUQG7TLN75IOC2WTNRUKO4VPNSDQF52MZB4ZE']) {
	test(`validates example checksum ${example.slice(0, 6)}`, async () => {
		const bad = 'A' + example.slice(1);
		const resolver = createResolver({
			lookup: async () => [],
			storage: memory({ 'ds-recent-wallets': JSON.stringify([bad, example]) })
		});
		assert.equal(isAddress(example), true);
		assert.deepEqual(await resolver.resolve(example), { ok: true, address: example });
		assert.equal(isAddress(bad), false);
		assert.deepEqual(await resolver.resolve(bad), {
			ok: false,
			message: `No wallet found for "${bad}"`
		});
		assert.deepEqual(resolver.recents(), [example]);
	});
}
