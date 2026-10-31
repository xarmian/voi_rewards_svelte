// TASK-109: module-level stores are server singletons under SSR, so a component that writes one during a server
// render leaks that state into every later request, and makes an upstream call on every render. Each case renders a
// component on the server with props that satisfy its reactive load trigger, then asserts that nothing was fetched
// and that every module-level store still holds its initial value.
import assert from 'node:assert/strict';
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

async function storeSnapshot() {
	const [{ get }, price, accounts, table, loading, collection] = await Promise.all([
		import('svelte/store'),
		import('$lib/stores/price'),
		import('$lib/stores/accounts'),
		import('../stores/dataTable'),
		import('$lib/stores/loadingStore'),
		import('../stores/collection')
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
		viewCollection: collection.viewCollection
	};
	return Object.fromEntries(Object.entries(stores).map(([name, store]) => [name, get(store)]));
}

// A fresh module graph per case: the wallet components import algosdk and the wallet libraries cold.
const test = (name: string, fn: () => Promise<void>) => baseTest(name, fn, 60_000);

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.resetModules();
	fetchSpy = vi.fn(() => Promise.reject(new Error('fetch during a server render')));
	vi.stubGlobal('fetch', fetchSpy);
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function assertNoServerWrites(
	load: () => Promise<{ default: unknown }>,
	props: Record<string, unknown>
) {
	const before = await storeSnapshot();
	const { default: component } = await load();
	// From the same module graph as the component, or the two hold separate SSR contexts.
	const { render } = await import('svelte/server');
	// render() is lazy: the component runs when the body is read.
	const { body } = render(component as Component<Record<string, unknown>>, { props });
	assert.ok(body.length > 0);
	// Let any load the render started run to its writes.
	await new Promise((resolve) => setTimeout(resolve, 200));
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

test('EpochComponent does not load epochs during a server render', async () => {
	await assertNoServerWrites(() => import('$lib/component/EpochComponent.svelte'), {
		walletAddress: WALLET
	});
});

test('LockVestComponent does not load contract details during a server render', async () => {
	await assertNoServerWrites(() => import('$lib/component/LockVestComponent.svelte'), {
		childAccounts: [{ contractId: 1, address: CHILD, isParticipating: false, balance: 0 }]
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
