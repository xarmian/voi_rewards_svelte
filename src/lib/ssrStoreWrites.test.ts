// TASK-109: module-level stores are server singletons under SSR, so a component that writes one during a server
// render leaks that state into every later request, and makes an upstream call on every render. Each case renders a
// component on the server with props that satisfy its reactive load trigger, then asserts that nothing was fetched
// and that every module-level store still holds its initial value.
import assert from 'node:assert/strict';
import { inspect, isDeepStrictEqual } from 'node:util';
import { afterEach, beforeEach, test as baseTest, vi } from 'vitest';
import type { Readable } from 'svelte/store';
import type { Component } from 'svelte';

vi.mock('$app/environment', () => ({
	browser: false,
	building: false,
	dev: false,
	version: 'test'
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn(), invalidateAll: vi.fn() }));
// Real clients against unroutable hosts, so their queries reach the fetch spy.
vi.mock('$env/static/public', () => ({
	PUBLIC_DS_GALLERY: '',
	PUBLIC_MIMIR_ANON_KEY: 'test',
	PUBLIC_MIMIR_URL: 'https://mimir.test',
	PUBLIC_SUPABASE_ANON_KEY: 'test',
	PUBLIC_SUPABASE_URL: 'https://supabase.test',
	PUBLIC_WALLETCONNECT_PROJECT_ID: 'test'
}));

const WALLET = 'G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ';
const CHILD = 'TNBABD63UMKQOG6AQJB5RLIHH4RS3HIDPJSAIUDM3ZRRIOFKCX65NS7DAQ';

// Module caches that are not stores are covered elsewhere: each one either fills only after a
// fetch (the fetch assertion sees it), is skipped without a document (tokenIcons, whose own test
// proves a server call caches nothing a browser call sees), or is written only by a user action.
async function storeSnapshot() {
	const [{ get }, price, accounts, table, loading, collection, flows] = await Promise.all([
		import('svelte/store'),
		import('$lib/stores/price'),
		import('$lib/stores/accounts'),
		import('$lib/epochRewards/dataTable'),
		import('$lib/stores/loadingStore'),
		import('../stores/collection'),
		import('$lib/chain/flowAccount')
	]);
	const stores: Record<string, Readable<unknown>> = {
		voiPrice: price.voiPrice,
		onlineStakeStore: accounts.onlineStakeStore,
		consensusInfo: accounts.consensusInfo,
		accountInfo: accounts.accountInfo,
		supply: accounts.supply,
		nfDomains: accounts.nfDomains,
		dataTable: table.dataTable,
		isLoading: loading.isLoading,
		tokenGroup: collection.tokenGroup,
		viewCollection: collection.viewCollection,
		pinnedFlows: flows.pinnedFlows
	};
	// Printed, not kept by reference, so a value mutated in place still compares unequal.
	return Object.fromEntries(
		Object.entries(stores).map(([name, store]) => [name, inspect(get(store), PRINT)])
	);
}

const PRINT = {
	depth: Infinity,
	maxArrayLength: Infinity,
	maxStringLength: Infinity,
	breakLength: Infinity,
	sorted: true
};

// A fresh module graph per case: the wallet components import algosdk and the wallet libraries cold.
// The wallet-page case alone takes 13 to 16 seconds on an idle box and 25 to 50 inside a full
// parallel run, so 60 seconds timed out twice in three full runs on a loaded one (TASK-149). The
// bound is a time limit, not an assertion: every case still has to finish its render and its checks.
const test = (name: string, fn: () => Promise<void>) => baseTest(name, fn, 180_000);

let fetchSpy: ReturnType<typeof vi.fn>;

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
type Handle = ReturnType<typeof realSetTimeout>;

// Timers scheduled from the render on, so the wait lasts until every one has run, however late.
let pendingTimeouts: Set<Handle>;
let intervals: Set<Handle>;

function sameHandle(set: Set<Handle>, id: unknown): Handle | undefined {
	for (const handle of set) if (handle === id || Number(handle) === Number(id)) return handle;
}

function trackTimers() {
	vi.stubGlobal(
		'setTimeout',
		(fn: (...args: unknown[]) => unknown, ms?: number, ...args: unknown[]) => {
			// A callback that returns a promise stays pending until it settles.
			const handle: Handle = realSetTimeout(() => {
				let result: unknown;
				try {
					result = fn(...args);
				} finally {
					if (result instanceof Promise) {
						// Left unhandled on purpose: a rejection here reaches the runner as before.
						void result.finally(() => pendingTimeouts.delete(handle));
					} else {
						pendingTimeouts.delete(handle);
					}
				}
			}, ms);
			pendingTimeouts.add(handle);
			return handle;
		}
	);
	vi.stubGlobal('clearTimeout', (id: unknown) => {
		const handle = sameHandle(pendingTimeouts, id);
		if (handle) pendingTimeouts.delete(handle);
		realClearTimeout(id as Handle);
	});
	vi.stubGlobal(
		'setInterval',
		(fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
			const handle = realSetInterval(fn, ms, ...args);
			intervals.add(handle);
			return handle;
		}
	);
	vi.stubGlobal('clearInterval', (id: unknown) => {
		const handle = sameHandle(intervals, id);
		if (handle) intervals.delete(handle);
		realClearInterval(id as Handle);
	});
}

beforeEach(() => {
	vi.resetModules();
	pendingTimeouts = new Set();
	intervals = new Set();
	fetchSpy = vi.fn(() => Promise.reject(new Error('fetch during a server render')));
	vi.stubGlobal('fetch', fetchSpy);
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	for (const handle of pendingTimeouts) realClearTimeout(handle);
	for (const handle of intervals) realClearInterval(handle);
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

// Long enough to cover an await between a load's start and its fetch, such as a cold import.
const QUIET_MS = 500;
const SETTLE_LIMIT_MS = 15_000;

// Waits until no timer the render scheduled is pending and neither the fetch log nor the stores
// have changed for QUIET_MS, so a load started late, or after another timer, still runs to its writes.
async function settle() {
	const state = async () => ({
		fetches: fetchSpy.mock.calls.length,
		stores: await storeSnapshot()
	});
	const deadline = Date.now() + SETTLE_LIMIT_MS;
	let last = await state();
	let quietSince = Date.now();
	for (;;) {
		await new Promise((resolve) => realSetTimeout(resolve, 20));
		const now = await state();
		if (pendingTimeouts.size > 0 || !isDeepStrictEqual(now, last)) {
			last = now;
			quietSince = Date.now();
		} else if (Date.now() - quietSince >= QUIET_MS) {
			return;
		}
		assert.ok(
			Date.now() < deadline,
			`the server render did not settle in ${SETTLE_LIMIT_MS} ms (${pendingTimeouts.size} timers pending)`
		);
	}
}

async function assertNoServerWrites(
	load: () => Promise<{ default: unknown }>,
	props: Record<string, unknown>
) {
	const before = await storeSnapshot();
	const { default: component } = await load();
	// From the same module graph as the component, or the two hold separate SSR contexts.
	const { render } = await import('svelte/server');
	trackTimers();
	// render() is lazy: the component runs when the body is read.
	const { body } = render(component as Component<Record<string, unknown>>, { props });
	assert.ok(body.length > 0);
	await settle();
	// An interval started on the server runs for the life of the process, once per request.
	assert.equal(intervals.size, 0, 'the server render started an interval');
	assert.deepEqual(
		fetchSpy.mock.calls.map(([url]) => String(url)),
		[],
		'the server render fetched'
	);
	assert.deepEqual(await storeSnapshot(), before, 'the server render wrote a module-level store');
}

test('the wallet page does not load the wallet during a server render', async () => {
	await assertNoServerWrites(() => import('../routes/(site)/wallet/[...id]/+page.svelte'), {
		data: { walletId: WALLET, parentWalletId: null, hash: '' }
	});
});

test('PortfolioComponent does not initialize during a server render', async () => {
	await assertNoServerWrites(() => import('$lib/component/PortfolioComponent.svelte'), {
		walletAddress: WALLET
	});
});

test('PortfolioSectionNFT does not fetch NFTs during a server render', async () => {
	await assertNoServerWrites(() => import('$lib/component/PortfolioSectionNFT.svelte'), {
		walletAddress: WALLET
	});
});

test('NodeComponent does not fetch node data during a server render', async () => {
	await assertNoServerWrites(() => import('$lib/component/NodeComponent.svelte'), {
		walletId: WALLET,
		parentWalletId: null,
		contractId: null
	});
});

test('WalletRewards does not load sources during a server render', async () => {
	await assertNoServerWrites(() => import('$lib/ds/WalletRewards/WalletRewards.svelte'), {
		pageAddress: WALLET
	});
});

test('Project does not load points during a server render', async () => {
	await assertNoServerWrites(() => import('$lib/component/Project.svelte'), {
		project: {
			id: 1,
			title: 'Voi Network',
			description: '',
			category: '',
			type: '',
			quests: []
		},
		wallet: WALLET,
		searchWallet: undefined
	});
});

test('StakingComponent does not load the staking contract during a server render', async () => {
	await assertNoServerWrites(() => import('$lib/component/ui/StakingComponent.svelte'), {
		address: CHILD
	});
});
