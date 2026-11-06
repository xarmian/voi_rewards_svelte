import { render } from 'svelte/server';
import Headline from '$lib/ds/Headline/Headline.svelte';
import WalletOverview from '$lib/ds/WalletOverview/WalletOverview.svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { epochRange } from '$lib/epochs';
const mocks = vi.hoisted(() => ({
	rows: vi.fn(),
	account: vi.fn(),
	tokens: vi.fn(),
	locks: vi.fn(),
	app: vi.fn()
}));
vi.mock('$lib/utils/algod', () => ({
	algodClient: { getApplicationByID: () => ({ do: mocks.app }) }
}));
vi.mock('$lib/stores/accounts', () => ({
	getAccountInfo: mocks.account,
	requireAccountInfo: mocks.account,
	getConsensusInfo: async () => ({ last_vote_timestamp: '2026-10-25T00:00:00Z', last_block: 99 }),
	getSupplyInfo: async () => ({
		'current-round': 100,
		'online-money': 1e12,
		'blacklisted-money': 0
	})
}));
vi.mock('$lib/services/lockvest', () => ({ getLockContractsByOwner: mocks.locks }));
vi.mock('$lib/services/accounts', () => ({ fetchFungibleTokens: mocks.tokens }));
vi.mock('$lib/stores/price', async () => {
	const { writable } = await import('svelte/store');
	return { fetchVoiPrice: async () => {}, voiPrice: writable({ price: 0.001, error: null }) };
});
vi.mock('$lib/utils', () => ({ getTokensByEpoch: async () => 2000000 }));
vi.mock('../../stores/dataTable', () => ({
	dataTable: {
		fetchDateRanges: async () =>
			Array.from({ length: 13 }, (_, i) => ({ epoch: 92 + i, id: epochRange(92 + i).id })),
		fetchData: mocks.rows
	}
}));
import { loadWallet } from './load';
import { summarizeWallet } from './summary';

beforeEach(() => {
	mocks.locks.mockResolvedValue([]);
	mocks.account.mockResolvedValue({
		amount: 1e9,
		status: 'Online',
		round: 100,
		minBalance: 100000
	});
	mocks.tokens.mockResolvedValue({ tokens: [], partial: false });
	mocks.rows.mockImplementation(async (range: string) => ({
		data: [{ proposer: 'OWNER', block_count: range === epochRange(104).id ? 4096 : 100 }],
		num_blocks: 100000,
		num_blocks_ballast: 0,
		max_timestamp: range === epochRange(104).id ? '2026-10-25T00:00:00Z' : '2026-10-21T00:00:00Z'
	}));
	vi.stubGlobal(
		'fetch',
		vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						epochs: Array.from({ length: 13 }, (_, i) => ({
							epoch_number: 92 + i,
							eligible_online_stake: 1e6
						}))
					})
				)
		)
	);
});
afterEach(() => vi.unstubAllGlobals());

it('uses the live epoch rows for the current figure and keeps 12 complete epochs separately', async () => {
	const data = await loadWallet('OWNER', 'OWNER');
	expect(data.current.epoch).toBe(104);
	expect(data.current.blocks.OWNER).toBe(4096);
	expect(data.current.progress).toBeGreaterThan(0);
	expect(data.current.progress).toBeLessThan(1);
	expect(data.history).toHaveLength(12);
	expect(data.history.every((epoch) => epoch.epoch < 104 && epoch.progress === 1)).toBe(true);
	expect(data.current.onlineStake).toBe(1e6);
});
it('a failed account read rejects rather than inventing a zero balance', async () => {
	mocks.account.mockResolvedValue(undefined);
	await expect(loadWallet('OWNER', 'OWNER')).rejects.toThrow('Account data unavailable');
});
it('a partial token response marks valuation unavailable', async () => {
	mocks.tokens.mockResolvedValue({ tokens: [], partial: true });
	expect((await loadWallet('OWNER', 'OWNER')).tokens.state).toBe('error');
});

it('uses historical stake already in VOI for expected blocks', async () => {
	mocks.account.mockResolvedValue({ amount: 10000e6, status: 'Online' });
	vi.mocked(fetch).mockResolvedValue(
		new Response(
			JSON.stringify({
				epochs: Array.from({ length: 13 }, (_, i) => ({
					epoch_number: 92 + i,
					eligible_online_stake: 725_200_000
				}))
			})
		)
	);
	const data = await loadWallet('OWNER', 'OWNER');
	const summary = summarizeWallet({ ...data, state: 'ready', now: Date.now() });
	expect(summary.history[0].expected).toBeCloseTo((100000 * 10000) / 725.2e6, 8);
});

it.each(['Offline', 'Online'])(
	'withholds whole-wallet staking figures for an %s owner when Lockvest lookup rejects',
	async (status) => {
		mocks.locks.mockRejectedValue(new Error('Lockvest unavailable'));
		mocks.account.mockResolvedValue({ amount: 1234e6, status });
		const data = await loadWallet('OWNER', 'OWNER');
		const summary = summarizeWallet({ ...data, state: 'ready', now: Date.now() });
		expect(data.owner.balance).toBe(1234);
		expect(summary.state).toBe('ready');
		expect(summary.contractsReady).toBe(false);
		expect(summary.holdings.total).toBeNull();
		const headline = render(Headline, {
			props: { account: { addr: 'OWNER' }, summary, onretry: () => {} }
		}).body;
		expect(headline).not.toContain("isn't staking");
		expect(headline).toContain('Retry');
		const overview = render(WalletOverview, {
			props: {
				summary,
				contracts: data.contracts,
				current: data.current,
				pageAddress: 'OWNER',
				selected: { address: 'OWNER', app: 'kibisis' },
				now: Date.now(),
				onrefresh: () => {}
			}
		}).body;
		const text = overview.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
		for (const claim of [
			'Offline',
			'0 VOI',
			'0 blocks',
			'All online accounts OK',
			'Staked online',
			'4,096 blocks'
		]) {
			expect(text).not.toContain(claim);
		}
		for (const message of [
			'Node health unavailable',
			'This epoch unavailable',
			"Couldn't load Blocks vs expected"
		]) {
			expect(text).toContain(message);
		}
		// Each unavailable staking card has an actual retry button.
		for (const title of ['Node health', 'This epoch so far', 'Blocks vs expected']) {
			const card = overview
				.replace(/<!--[\s\S]*?-->/g, '')
				.split('<h2')
				.find((part) => part.includes(`>${title}</h2>`));
			expect(card?.split('</section>')[0]).toContain('>Retry</button>');
		}
		expect(overview).not.toContain('aria-roledescription="chart"');
		expect(summary.contractSet).toBe('unavailable');
		expect(summary.current.blocks).toBeNull();
		expect(summary.earnedHistory).toBeNull();
		expect(overview).toContain('Withdrawable balance unavailable');
		expect(overview).toContain('Retry');
		expect(overview).not.toContain('No lock contracts');
		expect(overview).not.toContain('aria-haspopup="menu"');
	}
);

it('a forced load refreshes live rows and retains cached completed epochs', async () => {
	const { dataTable: realTable } =
		await vi.importActual<typeof import('../../stores/dataTable')>('../../stores/dataTable');
	realTable.clearCache();
	mocks.rows.mockImplementation(realTable.fetchData);
	let rowRequests = 0;
	vi.mocked(fetch).mockImplementation(async (url) => {
		if (url === '/api/epochs')
			return Response.json({
				epochs: Array.from({ length: 13 }, (_, i) => ({
					epoch_number: 92 + i,
					eligible_online_stake: 725_200_000
				}))
			});
		rowRequests++;
		if (
			rowRequests > 13 &&
			!String(url).includes(epochRange(104).start.toISOString().slice(0, 10))
		) {
			throw new Error('Completed history temporarily unavailable');
		}
		return Response.json({
			data: [{ proposer: 'OWNER', block_count: rowRequests }],
			num_blocks: 100000,
			num_blocks_ballast: 0,
			max_timestamp: '2026-10-25T00:00:00Z'
		});
	});
	const first = await loadWallet('OWNER', 'OWNER');
	expect(rowRequests).toBe(13);
	await loadWallet('OWNER', 'OWNER');
	expect(rowRequests).toBe(13);
	const refreshed = await loadWallet('OWNER', 'OWNER', true);
	expect(rowRequests).toBe(14);
	expect(refreshed.history).toEqual(first.history);
	expect(refreshed.historyState).toBe('ready');
	expect(refreshed.current.blocks.OWNER).not.toBe(first.current.blocks.OWNER);
	realTable.clearCache();
});

it.each(['app 404', 'app timeout'])(
	'keeps known contracts and staking figures when one contract has %s',
	async (reason) => {
		mocks.locks.mockResolvedValue([{ contractAddress: 'ESCROW', contractId: 7 }]);
		mocks.app.mockRejectedValue(new Error(reason));
		mocks.account.mockImplementation(async (address: string) => ({
			amount: address === 'OWNER' ? 1234e6 : 10000e6,
			status: address === 'OWNER' ? 'Offline' : 'Online',
			participation: address === 'OWNER' ? undefined : { voteLastValid: 10000000 }
		}));
		const data = await loadWallet('OWNER', 'OWNER');
		const summary = summarizeWallet({
			...data,
			state: 'ready',
			now: Date.parse('2026-10-25T00:00:00Z')
		});
		const headline = render(Headline, { props: { account: { addr: 'OWNER' }, summary } }).body;
		expect(headline).toContain('earning');
		expect(headline).not.toContain("couldn't load");
		const overview = render(WalletOverview, {
			props: {
				summary,
				contracts: data.contracts,
				current: data.current,
				historyState: data.historyState,
				pageAddress: 'OWNER',
				selected: null,
				now: Date.now(),
				onrefresh: () => {}
			}
		}).body;
		expect(overview).toContain('href="/wallet/ESCROW"');
		expect(overview).toContain('1 of 1 contracts online');
		expect(overview).toContain('All online accounts OK');
		expect(overview).toContain('Unavailable');
		expect(overview).toContain('Withdrawable balance unavailable');
		expect(overview).toContain('Unlock schedules unavailable');
		expect(overview).toContain('Locked balance unavailable');
		expect(overview).toContain('aria-roledescription="chart"');
		expect(overview).not.toContain('>Retry</button>');
		expect(summary.contractSet).toBe('ready');
		expect(summary.contractsReady).toBe(false);
		expect(summary.stakedOnline).toBe(10000);
		expect(summary.holdings.total).toBeNull();
		expect(summary.withdrawable).toBeNull();
	}
);
