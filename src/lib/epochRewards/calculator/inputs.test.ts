import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('$lib/stores/accounts', () => ({ requireAccountInfo: vi.fn(), getSupplyInfo: vi.fn() }));
vi.mock('../../../stores/dataTable', () => ({
	dataTable: { fetchDateRanges: vi.fn(), fetchData: vi.fn() }
}));
vi.mock('$lib/utils', () => ({ getTokensByEpoch: vi.fn(async () => 1400) }));
import { getSupplyInfo } from '$lib/stores/accounts';
import { dataTable } from '../../../stores/dataTable';
import { getTokensByEpoch } from '$lib/utils';
import { epochScheduleAmounts, loadCalculatorInputs } from './inputs';
import { estimateRewards } from '$lib/rewards/calculatorModel';
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getSupplyInfo).mockResolvedValue({
		'online-money': 10_000_000_000,
		'blacklisted-money': 1_000_000_000,
		'current-round': 1,
		'total-money': 20_000_000_000
	});
	vi.mocked(dataTable.fetchDateRanges).mockResolvedValue([{ epoch: 100, id: 'latest', desc: '' }]);
	vi.mocked(dataTable.fetchData).mockResolvedValue({ blacklist_balance_total: 1_000_000_000 });
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
it('reads the CSV pools for the twenty years from epoch 1, one after another', async () => {
	let settled = 0;
	vi.mocked(getTokensByEpoch).mockImplementation(async (epoch: number) => {
		expect(settled).toBe(epoch - 1);
		await Promise.resolve();
		settled++;
		return epoch * 2;
	});
	const amounts = await epochScheduleAmounts();
	expect(amounts).toHaveLength(20 * 52);
	expect(amounts[0]).toBe(2);
	expect(amounts.at(-1)).toBe(2080);
	expect(vi.mocked(getTokensByEpoch).mock.calls.map(([epoch]) => epoch)).toEqual(
		Array.from({ length: 1040 }, (_, index) => index + 1)
	);
});
