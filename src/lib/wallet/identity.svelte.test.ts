import { afterEach, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { createWalletIdentity } from './identity.svelte';

const environment = vi.hoisted(() => ({ browser: true }));
vi.mock('$app/environment', () => environment);
const A = { name: 'a.voi', avatar: 'https://host/a.png' };
const B = { name: 'b.voi', avatar: 'https://host/b.png' };
let dispose: (() => void) | undefined;
afterEach(() => {
	dispose?.();
	dispose = undefined;
	environment.browser = true;
	flushSync();
});
async function settle() {
	await Promise.resolve();
	await Promise.resolve();
	flushSync();
}
function deferred() {
	let resolve!: (identity: typeof A) => void;
	const promise = new Promise<typeof A>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

it('ignores A’s late response after B has loaded', async () => {
	let address = $state('A');
	const a = deferred();
	const b = deferred();
	const lookup = vi.fn((address: string) => (address === 'A' ? a.promise : b.promise));
	let identity!: ReturnType<typeof createWalletIdentity>;
	dispose = $effect.root(() => {
		identity = createWalletIdentity(() => address, lookup);
	});
	flushSync();
	expect({ ...identity }).toEqual({ name: null, avatar: null });
	address = 'B';
	flushSync();
	b.resolve(B);
	await settle();
	expect({ ...identity }).toEqual(B);
	a.resolve(A);
	await settle();
	expect({ ...identity }).toEqual(B);
});

it('resets name and avatar on address change before the next lookup settles', async () => {
	let address = $state('A');
	const b = deferred();
	let identity!: ReturnType<typeof createWalletIdentity>;
	dispose = $effect.root(() => {
		identity = createWalletIdentity(
			() => address,
			async (address) => (address === 'A' ? A : b.promise)
		);
	});
	flushSync();
	await settle();
	expect({ ...identity }).toEqual(A);
	address = 'B';
	flushSync();
	expect({ ...identity }).toEqual({ name: null, avatar: null });
	b.resolve(B);
	await settle();
	expect({ ...identity }).toEqual(B);
	address = '';
	flushSync();
	expect({ ...identity }).toEqual({ name: null, avatar: null });
});

it('leaves nulls when a lookup fails', async () => {
	let identity!: ReturnType<typeof createWalletIdentity>;
	dispose = $effect.root(() => {
		identity = createWalletIdentity(
			() => 'A',
			async () => {
				throw new Error('offline');
			}
		);
	});
	flushSync();
	await settle();
	expect({ ...identity }).toEqual({ name: null, avatar: null });
});

it('does not look up outside the browser', () => {
	environment.browser = false;
	const lookup = vi.fn(async () => A);
	dispose = $effect.root(() => {
		createWalletIdentity(() => 'A', lookup);
	});
	flushSync();
	expect(lookup).not.toHaveBeenCalled();
});

it('looks up once per address change without tracking unrelated lookup state', async () => {
	let address = $state('A');
	let unrelated = $state(0);
	const lookup = vi.fn(async () => {
		void unrelated;
		return A;
	});
	dispose = $effect.root(() => {
		createWalletIdentity(() => address, lookup);
	});
	flushSync();
	await settle();
	unrelated++;
	flushSync();
	await settle();
	expect(lookup).toHaveBeenCalledExactlyOnceWith('A');
	address = 'B';
	flushSync();
	await settle();
	expect(lookup.mock.calls).toEqual([['A'], ['B']]);
	address = '';
	flushSync();
	expect(lookup).toHaveBeenCalledTimes(2);
});
