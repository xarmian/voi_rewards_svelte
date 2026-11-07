import { beforeEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
vi.mock('$lib/stores/accounts', () => ({ requireAccountInfo: vi.fn(), getSupplyInfo: vi.fn() }));
vi.mock('../../stores/dataTable', () => ({
	dataTable: { fetchDateRanges: vi.fn(), fetchData: vi.fn() }
}));
vi.mock('$lib/utils', () => ({ getTokensByEpoch: vi.fn(async () => 1400) }));
vi.mock('$lib/stores/price', async () => {
	const { writable } = await import('svelte/store');
	return {
		voiPrice: writable({ price: 0.01, error: null, lastUpdated: new Date() }),
		fetchVoiPrice: vi.fn()
	};
});
import { requireAccountInfo, getSupplyInfo } from '$lib/stores/accounts';
import { dataTable } from '../../stores/dataTable';
import { voiPrice, fetchVoiPrice } from '$lib/stores/price';
import { loadCalculatorInputs, loadCalculatorBalance, loadCalculatorPrice } from './calculator';
import { estimateRewards } from '$lib/rewards/calculatorModel';
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireAccountInfo).mockResolvedValue({ amount: 0n } as Awaited<
		ReturnType<typeof requireAccountInfo>
	>);
	vi.mocked(getSupplyInfo).mockResolvedValue({
		'online-money': 10_000_000_000,
		'blacklisted-money': 1_000_000_000,
		'current-round': 1,
		'total-money': 20_000_000_000
	});
	vi.mocked(dataTable.fetchDateRanges).mockResolvedValue([{ epoch: 100, id: 'latest', desc: '' }]);
	vi.mocked(dataTable.fetchData).mockResolvedValue({ blacklist_balance_total: 1_000_000_000 });
	voiPrice.set({ price: 0.01, error: null, lastUpdated: new Date() });
});
it('reads the page address including a genuine zero balance', async () => {
	expect(await loadCalculatorBalance('Y', true)).toBe(0);
	expect(requireAccountInfo).toHaveBeenCalledWith('Y', { force: true });
});
it('rejects absent or failed balances instead of synthesizing zero and permits Retry', async () => {
	vi.mocked(requireAccountInfo).mockRejectedValueOnce(new Error('offline'));
	await expect(loadCalculatorBalance('Y')).rejects.toThrow('offline');
	vi.mocked(requireAccountInfo).mockResolvedValueOnce(
		{} as Awaited<ReturnType<typeof requireAccountInfo>>
	);
	await expect(loadCalculatorBalance('Y')).rejects.toThrow();
	expect(await loadCalculatorBalance('Y', true)).toBe(0);
});
it('keeps the denominator in microVOI and the existing representative formula', async () => {
	const input = await loadCalculatorInputs('Y', true);
	expect(input.rewardStake).toBe(9_000_000_000);
	expect(input.epochRewards).toHaveLength(52);
	expect(dataTable.fetchDateRanges).toHaveBeenCalledWith(true);
	expect(dataTable.fetchData).toHaveBeenCalledWith('latest', true);
	const result = estimateRewards({
		stake: 100,
		price: 0.01,
		onlineMoney: input.onlineMoney,
		rewardStake: input.rewardStake,
		epochRewards: input.epochRewards,
		nodeCost: 10,
		isPercentageBased: false,
		costPercentage: 10
	});
	expect(result?.weeklyReward).toBeCloseTo((1400 / 9000) * 100);
});
it('requires supply, live blacklist and schedule fields', async () => {
	vi.mocked(dataTable.fetchData).mockResolvedValueOnce({});
	await expect(loadCalculatorInputs('Y')).rejects.toThrow();
	vi.mocked(getSupplyInfo).mockResolvedValueOnce(null);
	await expect(loadCalculatorInputs('Y')).rejects.toThrow();
	vi.mocked(dataTable.fetchDateRanges).mockResolvedValueOnce([]);
	await expect(loadCalculatorInputs('Y')).rejects.toThrow();
});
it('isolates price failure from native estimates and retries price alone', async () => {
	voiPrice.set({ ...get(voiPrice), error: 'offline' });
	await expect(loadCalculatorPrice('Y')).rejects.toThrow();
	expect((await loadCalculatorInputs('Y')).rewardStake).toBe(9_000_000_000);
	voiPrice.set({ ...get(voiPrice), error: null });
	expect(await loadCalculatorPrice('Y', true)).toBe(0.01);
	expect(fetchVoiPrice).toHaveBeenLastCalledWith(true);
});

it('rejects null and blank balance and blacklist fields instead of coercing them to zero', async () => {
	for (const invalid of [null, '']) {
		vi.mocked(requireAccountInfo).mockResolvedValueOnce({ amount: invalid } as unknown as Awaited<
			ReturnType<typeof requireAccountInfo>
		>);
		await expect(loadCalculatorBalance('Y')).rejects.toThrow();
		vi.mocked(dataTable.fetchData).mockResolvedValueOnce({ blacklist_balance_total: invalid });
		await expect(loadCalculatorInputs('Y')).rejects.toThrow();
	}
});
