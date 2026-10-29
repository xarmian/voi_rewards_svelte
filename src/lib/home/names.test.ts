import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { createNameResolver } from './names';

test('resolves all 109 proposers and skips cached or in-flight addresses', async () => {
	const addresses = Array.from({ length: 109 }, (_, index) => `proposer-${index}`);
	const found = addresses.map((address) => ({ address, name: `${address}.voi` }));
	let finish!: (value: typeof found) => void;
	const lookup = vi.fn<(addresses: string[]) => Promise<typeof found>>(
		() => new Promise<typeof found>((resolve) => (finish = resolve))
	);
	const resolver = createNameResolver(lookup);
	const pending = resolver.resolve(addresses);
	await resolver.resolve(addresses);
	assert.equal(lookup.mock.calls.length, 1);
	finish(found);
	const names = await pending;
	assert.deepEqual(
		lookup.mock.calls.flatMap((args) => args[0]),
		addresses
	);
	assert.deepEqual(names, Object.fromEntries(found.map(({ address, name }) => [address, name])));
	assert.deepEqual(await resolver.resolve(addresses), names);
	assert.equal(lookup.mock.calls.length, 1);
});

test('handles a rejected lookup and retries the same addresses on the next resolve', async () => {
	const lookup = vi
		.fn<(addresses: string[]) => Promise<{ address: string; name: string }[]>>()
		.mockRejectedValueOnce(new Error('Unavailable'))
		.mockResolvedValueOnce([{ address: 'a', name: 'alice.voi' }]);
	const resolver = createNameResolver(lookup);
	// Capture rejection here so the old behavior produces assertions, not an unhandled rejection.
	const first = await resolver.resolve(['a']).catch(() => 'rejected');
	const second = await resolver.resolve(['a']);
	assert.deepEqual(lookup.mock.calls, [[['a']], [['a']]]);
	assert.deepEqual(first, {});
	assert.deepEqual(second, { a: 'alice.voi' });
});

test('retries missing results while keeping names successfully cached across epochs', async () => {
	const lookup = vi
		.fn<(addresses: string[]) => Promise<{ address: string; name: string }[]>>()
		.mockResolvedValueOnce([{ address: 'a', name: 'alice.voi' }])
		.mockResolvedValueOnce([{ address: 'b', name: 'bob.voi' }]);
	const resolver = createNameResolver(lookup);
	assert.deepEqual(await resolver.resolve(['a', 'b']), { a: 'alice.voi' });
	assert.deepEqual(await resolver.resolve(['a', 'b']), { a: 'alice.voi', b: 'bob.voi' });
	assert.deepEqual(lookup.mock.calls, [[['a', 'b']], [['b']]]);
});
