import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { epochRange } from '$lib/epochs';
const mocks = vi.hoisted(() => ({ rows: vi.fn(), account: vi.fn(), tokens: vi.fn() }));
vi.mock('$lib/utils/algod', () => ({ algodClient: {} }));
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
vi.mock('$lib/services/lockvest', () => ({ getLockContractsByOwner: async () => [] }));
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

beforeEach(() => {
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
