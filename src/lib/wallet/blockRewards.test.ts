import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAccountInfo } from '$lib/stores/accounts';
import { readBonus, readFeeSink } from '$lib/rewards/blockRewardChain';
import {
	BLOCK_REWARD_LAG_ALERT_ROUNDS,
	BLOCK_REWARD_PAGE_SIZE,
	isPartialBlockReward,
	loadBlockRewardFunding,
	loadBlockRewards,
	loadBlockRewardsDaily,
	loadBlockRewardStatus,
	loadNetworkBlockRewardsDaily,
	mimirLagRounds,
	type NetworkBlockRewardDay
} from './blockRewards';

vi.mock('$lib/utils', () => ({ getTokensByEpoch: vi.fn() }));
vi.mock('$lib/stores/accounts', () => ({
	getSupplyInfo: vi.fn(),
	requireAccountInfo: vi.fn(),
	onlineStakeStore: { getData: vi.fn(), refresh: vi.fn() }
}));
vi.mock('../../stores/dataTable', () => ({
	dataTable: { fetchDateRanges: vi.fn(), fetchData: vi.fn() }
}));
vi.mock('$lib/rewards/blockRewardChain', () => ({ readBonus: vi.fn(), readFeeSink: vi.fn() }));

const address = 'PAGE';
let fetchMock: ReturnType<typeof vi.fn>;
const respond = (body: unknown, ok = true, status = 200) =>
	fetchMock.mockResolvedValue({ ok, status, json: async () => body });
const requested = () => new URL(fetchMock.mock.calls[0][0] as string, 'http://local');
const reward = (overrides: Record<string, unknown> = {}) => ({
	round: 30_000_000,
	realtime: '2026-11-15T12:00:00+00:00',
	txid: 'TX1',
	amount: 5_500_000,
	bonus: 5_000_000,
	fees_collected: 1_000_000,
	...overrides
});

beforeEach(() => {
	vi.clearAllMocks();
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('loadBlockRewards', () => {
	it('requests the first page before the maximum round', async () => {
		respond({ data: [] });
		await expect(loadBlockRewards(address)).resolves.toEqual([]);
		const url = requested();
		expect(url.pathname).toBe('/api/mimir');
		expect(Object.fromEntries(url.searchParams)).toEqual({
			action: 'get_block_rewards',
			p_address: address,
			p_before_round: String(Number.MAX_SAFE_INTEGER),
			p_limit: String(BLOCK_REWARD_PAGE_SIZE)
		});
		expect(BLOCK_REWARD_PAGE_SIZE).toBe(100);
	});

	it('requests later pages before the given round and honours force', async () => {
		respond({ data: [] });
		await loadBlockRewards(address, 29_000_000, true);
		expect(requested().searchParams.get('p_before_round')).toBe('29000000');
		expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
	});

	it('maps valid rows', async () => {
		respond({ data: [reward(), reward({ round: 29_999_000, txid: 'TX2', amount: 5_000_000 })] });
		await expect(loadBlockRewards(address)).resolves.toEqual([
			{
				round: 30_000_000,
				time: '2026-11-15T12:00:00.000Z',
				txid: 'TX1',
				amount: 5_500_000,
				bonus: 5_000_000,
				feesCollected: 1_000_000,
				partial: false
			},
			{
				round: 29_999_000,
				time: '2026-11-15T12:00:00.000Z',
				txid: 'TX2',
				amount: 5_000_000,
				bonus: 5_000_000,
				feesCollected: 1_000_000,
				partial: true
			}
		]);
	});

	it('throws on any malformed row or data', async () => {
		for (const bad of [
			{ round: 0 },
			{ round: -1 },
			{ round: 1.5 },
			{ round: '30' },
			{ realtime: 'nope' },
			{ realtime: 5 },
			{ txid: '' },
			{ txid: 5 },
			{ amount: -1 },
			{ amount: Number.MAX_SAFE_INTEGER + 2 },
			{ bonus: null },
			{ fees_collected: undefined }
		]) {
			respond({ data: [reward(), reward(bad)] });
			await expect(loadBlockRewards(address)).rejects.toThrow('Invalid block reward data');
		}
		for (const body of [{ data: 'x' }, {}, [], { data: [null] }]) {
			respond(body);
			await expect(loadBlockRewards(address)).rejects.toThrow('Invalid block reward data');
		}
	});

	it('throws on an error body or a failed response', async () => {
		respond({ error: 'down' });
		await expect(loadBlockRewards(address)).rejects.toThrow();
		respond({ data: [] }, false, 500);
		await expect(loadBlockRewards(address)).rejects.toThrow();
	});
});

describe('loadBlockRewardsDaily', () => {
	it('requests and maps daily rows', async () => {
		respond({
			data: [
				{ day: '2026-11-14', block_rewards: 0, amount: 0 },
				{ day: '2026-11-15', block_rewards: 2, amount: 10_000_000 }
			]
		});
		await expect(loadBlockRewardsDaily(address, 30)).resolves.toEqual([
			{ day: '2026-11-14', count: 0, amount: 0 },
			{ day: '2026-11-15', count: 2, amount: 10_000_000 }
		]);
		expect(Object.fromEntries(requested().searchParams)).toEqual({
			action: 'get_block_rewards_daily',
			p_address: address,
			p_days: '30'
		});
	});

	it('throws on malformed rows', async () => {
		for (const row of [
			{ day: '2026-11-1', block_rewards: 0, amount: 0 },
			{ day: '2026-13-45', block_rewards: 0, amount: 0 },
			{ day: '2026-11-15', block_rewards: -1, amount: 0 },
			{ day: '2026-11-15', block_rewards: 0, amount: 0.5 }
		]) {
			respond({ data: [row] });
			await expect(loadBlockRewardsDaily(address, 30)).rejects.toThrow('Invalid block reward data');
		}
	});
});

describe('loadNetworkBlockRewardsDaily', () => {
	it('requests and maps network rows, keeping a null last round', async () => {
		respond({
			data: [
				{
					day: '2026-11-14',
					blocks: 0,
					rewarded_blocks: 0,
					amount: 0,
					fees_collected: 0,
					last_round: null
				},
				{
					day: '2026-11-15',
					blocks: 30_000,
					rewarded_blocks: 29_000,
					amount: 145_000_000_000,
					fees_collected: 3_000_000,
					last_round: 30_000_000
				}
			]
		});
		await expect(loadNetworkBlockRewardsDaily(7, true)).resolves.toEqual([
			{
				day: '2026-11-14',
				blocks: 0,
				rewardedBlocks: 0,
				amount: 0,
				feesCollected: 0,
				lastRound: null
			},
			{
				day: '2026-11-15',
				blocks: 30_000,
				rewardedBlocks: 29_000,
				amount: 145_000_000_000,
				feesCollected: 3_000_000,
				lastRound: 30_000_000
			}
		]);
		expect(Object.fromEntries(requested().searchParams)).toEqual({
			action: 'get_block_rewards_network_daily',
			p_days: '7'
		});
	});

	it('throws on malformed rows', async () => {
		respond({
			data: [
				{
					day: '2026-11-15',
					blocks: 1,
					rewarded_blocks: 1,
					amount: 1,
					fees_collected: 1,
					last_round: 0
				}
			]
		});
		await expect(loadNetworkBlockRewardsDaily(7)).rejects.toThrow('Invalid block reward data');
	});
});

describe('isPartialBlockReward', () => {
	it('flags rewards below bonus plus the fee share', () => {
		expect(
			isPartialBlockReward({ amount: 5_499_999, bonus: 5_000_000, feesCollected: 1_000_000 })
		).toBe(true);
		expect(
			isPartialBlockReward({ amount: 5_500_000, bonus: 5_000_000, feesCollected: 1_000_000 })
		).toBe(false);
		expect(isPartialBlockReward({ amount: 5_000_000, bonus: 5_000_000, feesCollected: 1 })).toBe(
			false
		);
	});

	it('treats a larger amount as full and warns', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(
			isPartialBlockReward({ amount: 6_000_000, bonus: 5_000_000, feesCollected: 1_000_000 })
		).toBe(false);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});

describe('mimirLagRounds', () => {
	const day = (lastRound: number | null): NetworkBlockRewardDay => ({
		day: '2026-11-15',
		blocks: 0,
		rewardedBlocks: 0,
		amount: 0,
		feesCollected: 0,
		lastRound
	});

	it('measures lag from the newest recorded round', () => {
		expect(mimirLagRounds(30_000_300, [day(29_999_000), day(30_000_000), day(null)])).toBe(300);
		expect(BLOCK_REWARD_LAG_ALERT_ROUNDS).toBe(200);
	});

	it('is never negative when the indexed data is ahead of the algod read', () => {
		expect(mimirLagRounds(30_000_000, [day(30_000_004)])).toBe(0);
	});

	it('is null when no day has a round', () => {
		expect(mimirLagRounds(30_000_300, [day(null), day(null)])).toBeNull();
		expect(mimirLagRounds(30_000_300, [])).toBeNull();
	});
});

describe('loadBlockRewardStatus', () => {
	it('passes force and evaluates the account', async () => {
		vi.mocked(requireAccountInfo).mockResolvedValue({
			status: 'Online',
			incentiveEligible: true,
			amount: 50_000_000_000n,
			round: 100n,
			participation: { voteLastValid: 200n }
		} as never);
		await expect(
			loadBlockRewardStatus(address, { isContract: false, force: true })
		).resolves.toEqual({ registered: true, reasons: [], balance: 50_000_000_000 });
		expect(requireAccountInfo).toHaveBeenCalledWith(address, { force: true });
	});

	it('reports reasons for a contract', async () => {
		vi.mocked(requireAccountInfo).mockResolvedValue({
			status: 'Offline',
			amount: 50_000_000_000n,
			round: 100n
		} as never);
		const status = await loadBlockRewardStatus(address, { isContract: true });
		expect(status.reasons.map((reason) => reason.code)).toEqual(['contract', 'offline']);
		expect(requireAccountInfo).toHaveBeenCalledWith(address, { force: false });
	});
});

describe('loadBlockRewardFunding', () => {
	it('reports paused when the sink cannot cover the bonus', async () => {
		vi.mocked(readFeeSink).mockResolvedValue({ amount: 5_100_000, minBalance: 100_001 });
		vi.mocked(readBonus).mockResolvedValue({ bonus: 5_000_000, round: 1 });
		await expect(loadBlockRewardFunding()).resolves.toEqual({
			funding: 'paused',
			bonus: 5_000_000
		});
	});

	it('reports funded when the sink covers the bonus', async () => {
		vi.mocked(readFeeSink).mockResolvedValue({ amount: 5_100_000, minBalance: 100_000 });
		vi.mocked(readBonus).mockResolvedValue({ bonus: 5_000_000, round: 1 });
		await expect(loadBlockRewardFunding()).resolves.toEqual({
			funding: 'funded',
			bonus: 5_000_000
		});
	});

	it('reports unknown, never paused, when the sink read fails', async () => {
		vi.mocked(readFeeSink).mockRejectedValue(new Error('down'));
		vi.mocked(readBonus).mockResolvedValue({ bonus: 5_000_000, round: 1 });
		await expect(loadBlockRewardFunding()).resolves.toEqual({
			funding: 'unknown',
			bonus: 5_000_000
		});
	});

	it('reports unknown when the bonus read fails', async () => {
		vi.mocked(readFeeSink).mockResolvedValue({ amount: 0, minBalance: 100_000 });
		vi.mocked(readBonus).mockRejectedValue(new Error('down'));
		await expect(loadBlockRewardFunding()).resolves.toEqual({ funding: 'unknown', bonus: null });
	});
});
