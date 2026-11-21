import { beforeEach, expect, test, vi } from 'vitest';
import { render } from 'svelte/server';

// The switch-off wallet: no epoch read starts and no epoch figure is returned.
// The flag is a getter so one case can compare against the switch-on summary.
const flag = vi.hoisted(() => ({ on: false }));
vi.mock('$lib/epochRewards/config', () => ({
	get EPOCH_REWARDS_ENABLED() {
		return flag.on;
	}
}));
const mocks = vi.hoisted(() => ({
	account: vi.fn(),
	supply: vi.fn(),
	locks: vi.fn(),
	tokens: vi.fn(),
	dates: vi.fn(),
	rows: vi.fn(),
	pool: vi.fn()
}));
vi.mock('$lib/utils/algod', () => ({
	algodClient: { getApplicationByID: () => ({ do: async () => ({ params: { globalState: [] } }) }) }
}));
vi.mock('$lib/chain/keyreg', async (original) => ({
	...(await original<typeof import('$lib/chain/keyreg')>()),
	contractIncentiveOf: async () => 'incapable'
}));
vi.mock('$lib/stores/accounts', () => ({
	getAccountInfo: mocks.account,
	requireAccountInfo: mocks.account,
	getSupplyInfo: () => mocks.supply()
}));
vi.mock('$lib/services/lockvest', () => ({ getLockContractsByOwner: mocks.locks }));
vi.mock('$lib/services/accounts', () => ({ fetchFungibleTokens: mocks.tokens }));
vi.mock('$lib/stores/price', async () => {
	const { writable } = await import('svelte/store');
	return { fetchVoiPrice: async () => {}, voiPrice: writable({ price: 0.001, error: null }) };
});
vi.mock('$lib/utils', () => ({ getTokensByEpoch: mocks.pool }));
vi.mock('./dataTable', () => ({
	dataTable: { fetchDateRanges: mocks.dates, fetchData: mocks.rows }
}));
vi.mock('$lib/component/RegisterVoteKey.svelte', () => ({ default: () => {} }));
vi.mock('$lib/component/WithdrawModal.svelte', () => ({ default: () => {} }));
vi.mock('$lib/epochRewards/client', async (original) => {
	const actual = await original<typeof import('$lib/epochRewards/client')>();
	return { ...actual, createEpochRewardsState: vi.fn(actual.createEpochRewardsState) };
});
import { loadWallet } from '$lib/wallet/load';
import { summarizeWallet } from '$lib/wallet/summary';
import type { WalletAccount, WalletContract } from '$lib/wallet/summary';
import { createEpochRewardsState, epochRewardReaders } from '$lib/epochRewards/client';
import WalletOverview from '$lib/ds/WalletOverview/WalletOverview.svelte';
import WalletContracts from '$lib/ds/WalletContracts/WalletContracts.svelte';
import WalletRewards from '$lib/ds/WalletRewards/WalletRewards.svelte';

beforeEach(() => {
	flag.on = false;
	vi.clearAllMocks();
	mocks.supply.mockResolvedValue({
		'current-round': 100,
		'online-money': 1e12,
		'blacklisted-money': 0
	});
	mocks.account.mockResolvedValue({ amount: 1e9, status: 'Online', round: 100, minBalance: 1e5 });
	mocks.locks.mockResolvedValue([{ contractAddress: 'ESCROW', contractId: 7 }]);
	mocks.tokens.mockResolvedValue({ tokens: [], partial: false });
	mocks.dates.mockRejectedValue(new Error('proposers API down'));
	mocks.rows.mockRejectedValue(new Error('proposers API down'));
	mocks.pool.mockResolvedValue(2000000);
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ epochs: [] }))
	);
});

test('the wallet load makes no epoch read and resolves while the epoch rows are down', async () => {
	const before = Date.now();
	const data = await loadWallet('OWNER', 'OWNER');
	const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
	expect(urls.filter((url) => url.includes('/api/epochs'))).toEqual([]);
	expect(mocks.dates).not.toHaveBeenCalled();
	expect(mocks.rows).not.toHaveBeenCalled();
	expect(mocks.pool).not.toHaveBeenCalled();
	expect(data).toMatchObject({ current: null, history: [], historyState: 'ready' });
	expect(new Date(data.asOf).toISOString()).toBe(data.asOf);
	expect(Date.parse(data.asOf)).toBeGreaterThanOrEqual(before);
	expect(data.owner).toMatchObject({ address: 'OWNER', balance: 1000 });
	expect(data.contracts.map((contract) => contract.address)).toEqual(['ESCROW']);
	expect(data.contractSet).toBe('ready');
	expect(data.tokens.state).toBe('ready');
	expect(data.children).toHaveLength(1);
	for (const account of [data.primary, ...data.children]) {
		for (const key of [
			'estimatedRewardsPerDay',
			'estimatedRewardsPerWeek',
			'estimatedRewardsPerMonth'
		]) {
			expect(account).not.toHaveProperty(key);
		}
	}
});

test('the wallet summary has no epoch keys and the same health and holdings', () => {
	const owner: WalletAccount = {
		address: 'OWNER',
		contractId: 0,
		balance: 5000,
		isParticipating: true,
		round: 100,
		voteLastValid: 300000
	};
	const input = {
		owner,
		contracts: [],
		current: {
			epoch: 104,
			networkBlocks: 100000,
			onlineStake: 1e6,
			pool: 2000000,
			progress: 0.5,
			blocks: { OWNER: 400 }
		},
		history: [],
		state: 'ready' as const,
		now: Date.parse('2026-10-25T00:00:00Z'),
		tokens: { state: 'ready' as const, lp: 0, other: 0, lpCount: 0, tokenCount: 0 }
	};
	const off = summarizeWallet(input);
	flag.on = true;
	const on = summarizeWallet(input);
	const epochKeys = ['current', 'history', 'earnedHistory', 'historyRatio', 'tooEarly'];
	for (const key of epochKeys) expect(off).not.toHaveProperty(key);
	expect(Object.keys(off).sort()).toEqual(
		Object.keys(on)
			.filter((key) => !epochKeys.includes(key))
			.sort()
	);
	for (const [key, value] of Object.entries(off))
		expect(value, key).toEqual(on[key as keyof typeof on]);
});

const now = Date.parse('2026-10-25T00:00:00Z');
const contract: WalletContract = {
	address: 'ESCROW',
	contractId: 7,
	balance: 10000,
	minBalance: 0.1,
	isParticipating: true,
	round: 100,
	voteLastValid: 300000,
	details: null
};
const text = (html: string) =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ');
/** Each titled card's class list and the text after its title. */
function cards(html: string) {
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.split('<section')
		.slice(1)
		.map((part) => {
			const title = part.match(/<h2[^>]*>([^<]*)<\/h2>/)?.[1] ?? '';
			const body = text(part.split('</h2>').slice(1).join('</h2>').split('</section>')[0]);
			return { title, classes: part.match(/class="([^"]*)"/)?.[1] ?? '', body: body.trim() };
		});
}

test('the Overview has no epoch card or chart, and Node health widens beside Holdings', () => {
	const summary = summarizeWallet({
		owner: null,
		contracts: [contract],
		current: null,
		history: [],
		state: 'ready',
		now,
		tokens: { state: 'ready', lp: 0, other: 0, lpCount: 0, tokenCount: 0 }
	});
	const html = render(WalletOverview, {
		props: {
			summary,
			contracts: [contract],
			current: null,
			historyState: 'ready',
			pageAddress: 'OWNER',
			accountState: { state: 'read-only' },
			now
		}
	}).body;
	expect(text(html)).not.toMatch(/epoch/i);
	expect(html).not.toContain('This epoch so far');
	expect(html).not.toContain('Blocks vs expected');
	const shown = cards(html);
	expect(shown.find((card) => card.title === 'Node health')?.classes).toContain('lg:col-span-8');
	expect(shown.find((card) => card.title === 'Holdings')?.classes).toContain('lg:col-span-4');
	for (const card of shown) expect(card.body, card.title).not.toBe('');
});

test('the Contracts table has no blocks-this-epoch column or detail', () => {
	for (const mode of ['overview', 'full'] as const) {
		const html = render(WalletContracts, {
			props: {
				contracts: [contract],
				current: null,
				pageAddress: 'OWNER',
				accountState: { state: 'read-only' },
				state: 'ready',
				mode
			}
		}).body;
		expect(html, mode).not.toContain('Blocks this epoch');
	}
});

test('the Rewards tab has no epoch table, payouts chart or epoch refresh, and its daily chart is full width', () => {
	const html = render(WalletRewards, {
		props: { pageAddress: 'Y', now: new Date('2026-11-07T12:00:00Z') }
	}).body;
	for (const gone of ['Rewards by epoch', 'Recorded epoch rewards', 'Refresh rewards'])
		expect(html).not.toContain(gone);
	expect(html).toContain('Daily proposals');
	expect(html).toMatch(/class="[^"]*lg:col-span-12[^"]*"/);
	expect(html).not.toContain('lg:col-span-8');
	expect(createEpochRewardsState).not.toHaveBeenCalled();
});

test('no epoch reader is made without the epoch sources', () => {
	expect(epochRewardReaders(null)).toBeNull();
});
