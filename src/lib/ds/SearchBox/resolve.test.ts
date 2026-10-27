import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { createResolver, isAddress } from './resolve';
const address = 'A'.repeat(58);
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
	test('addresses use trimmed length', () => {
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
});
describe('recent wallets', () => {
	test('caps at five, newest first, without duplicates', () => {
		const resolver = createResolver({ storage: memory() });
		for (const char of 'ABCDEF') resolver.remember(char.repeat(58));
		resolver.remember('D'.repeat(58));
		assert.deepEqual(
			resolver.recents(),
			['D', 'F', 'E', 'C', 'B'].map((c) => c.repeat(58))
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
