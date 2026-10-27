import { describe, test, vi } from 'vitest';
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
	test('addresses use a trimmed shape check', () => {
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
	test('caps at five, newest first, without duplicates', async () => {
		const { encodeAddress } = await import('algosdk');
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
		assert.equal(isAddress(bad), true);
		assert.deepEqual(await resolver.resolve(bad), {
			ok: false,
			message: `No wallet found for "${bad}"`
		});
		assert.deepEqual(await resolver.resolve('picked', { address: bad }), {
			ok: false,
			message: 'No wallet found for "picked"'
		});
		assert.deepEqual(resolver.recents(), [bad, example]);
		assert.equal((await resolver.resolve('recent', { address: resolver.recents()[0] })).ok, false);
	});
}

test('rejects a bad checksum returned by enVoi', async () => {
	const resolver = createResolver({ lookup: async () => ['A' + address.slice(1)] });
	assert.deepEqual(await resolver.resolve('bad.voi'), {
		ok: false,
		message: 'No wallet found for "bad.voi"'
	});
});

test('loads the checksum validator only once but validates every resolution', async () => {
	const { isValidAddress } = await import('algosdk');
	const validate = vi.fn(isValidAddress);
	const loadValidator = vi.fn(async () => validate);
	const resolver = createResolver({
		loadValidator,
		search,
		lookup: async () => [address],
		storage: memory()
	});
	resolver.recents();
	await resolver.suggest('name');
	assert.equal(loadValidator.mock.calls.length, 0);
	const results = await Promise.all([
		resolver.resolve(address),
		resolver.resolve('picked', { address }),
		resolver.resolve('name.voi'),
		resolver.resolve('A' + address.slice(1))
	]);
	assert.deepEqual(
		results.map((result) => result.ok),
		[true, true, true, false]
	);
	assert.equal(loadValidator.mock.calls.length, 1);
	assert.equal(validate.mock.calls.length, 4);
});

test('a failed checksum import fails closed for typed, picked and looked-up addresses', async () => {
	const loadValidator = vi.fn(async () => {
		throw new Error('offline');
	});
	const resolver = createResolver({ loadValidator, lookup: async () => [address] });
	for (const [input, picked] of [
		[address, undefined],
		['picked', { address }],
		['name.voi', undefined]
	] as const) {
		assert.deepEqual(await resolver.resolve(input, picked), {
			ok: false,
			message: `No wallet found for "${input}"`
		});
	}
	assert.equal(loadValidator.mock.calls.length, 1);
});
