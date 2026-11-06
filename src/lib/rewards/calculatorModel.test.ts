import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { estimateRewards, type Estimate, type EstimateInput } from './calculatorModel';

const input: EstimateInput = {
	stake: 1000,
	price: 0.01,
	onlineMoney: 120_000_000_000,
	rewardStake: 100_000_000_000,
	epochRewards: Array(52).fill(1000),
	nodeCost: 10,
	isPercentageBased: false,
	costPercentage: 10
};

test('calculates hand-checkable rewards and compounds the yearly balance', () => {
	const result = estimateRewards(input)!;
	// share = 1000 / (100_000_000_000 / 1e6) = 0.01; weekly = 0.01 * 1000 = 10.
	// Monthly i < 30.44 / 7 (4.348...) visits i = 0..4: five rewards, without compounding.
	// APR = (share * 1000 / 1000) * 52 * 100 = 52 percent.
	expect(result.weeklyReward).toBe(10);
	expect(result.weeklyRewardUSD).toBe(0.1);
	expect(result.monthlyReward).toBe(10 * 5);
	expect(result.apr).toBe(((0.01 * 1000) / 1000) * 52 * 100);
	expect(result.yearlyReward).toBeGreaterThan(52 * result.weeklyReward);
	expect(result.balanceAfterWeek).toBe(1010);
});

test('preserves every output for an irregular descending epoch pool', () => {
	const result = estimateRewards({
		stake: 123456.789,
		price: 0.003721,
		onlineMoney: 1234567890000000,
		rewardStake: 987654321000000,
		epochRewards: Array.from({ length: 52 }, (_, i) => Math.round(3_000_000 * 0.97 ** i)),
		nodeCost: 17.83,
		isPercentageBased: false,
		costPercentage: 13.7
	})!;
	// values from the pre-extraction implementation (same inputs)
	const expected: Estimate = {
		expectedWeeklyBlocks: 21.6,
		expectedMonthlyBlocks: 93.92914285714286,
		expectedYearlyBlocks: 1127.057142857143,
		apr: 15.794999999802561,
		apy: 8.372165173820312,
		profitabilityThreshold: 338500,
		weeklyReward: 374.9999965828125,
		weeklyRewardUSD: 1.3953749872846453,
		monthlyReward: 1765.824608908923,
		monthlyRewardUSD: 6.5706333697501025,
		monthlyProfit: -11.259366630249897,
		monthlyProfitPercentage: -63.14843875630902,
		yearlyReward: 10336.006293374774,
		yearlyRewardUSD: 38.460279417647534,
		yearlyProfit: -175.49972058235244,
		yearlyProfitPercentage: -82.02454691641076,
		balanceAfterWeek: 123831.78899658282,
		balanceAfterMonth: 125222.61360890893,
		balanceAfterYear: 133792.79529337483
	};
	expect(Object.keys(result).sort()).toEqual(Object.keys(expected).sort());
	for (const key of Object.keys(expected) as (keyof Estimate)[]) {
		expect(result[key], key).toBeCloseTo(expected[key], 9);
	}
});

test.each([{ rewardStake: 0 }, { rewardStake: -1 }, { onlineMoney: 0 }])(
	'returns null when supply is unavailable: %j',
	(overrides) => {
		expect(estimateRewards({ ...input, ...overrides })).toBeNull();
	}
);

test.each([0, -1])('uses potential rates but zero rewards and balances for stake %s', (stake) => {
	const result = estimateRewards({ ...input, stake })!;
	const potential = estimateRewards({ ...input, stake: 1 })!;
	for (const key of [
		'apr',
		'apy',
		'profitabilityThreshold',
		'expectedWeeklyBlocks',
		'expectedMonthlyBlocks',
		'expectedYearlyBlocks'
	] as const) {
		expect(result[key], key).toBe(potential[key]);
	}
	for (const key of [
		'weeklyReward',
		'weeklyRewardUSD',
		'monthlyReward',
		'monthlyRewardUSD',
		'monthlyProfit',
		'monthlyProfitPercentage',
		'yearlyReward',
		'yearlyRewardUSD',
		'yearlyProfit',
		'yearlyProfitPercentage',
		'balanceAfterWeek',
		'balanceAfterMonth',
		'balanceAfterYear'
	] as const) {
		expect(result[key], key).toBe(0);
	}
});

test('deducts percentage-based node cost from monthly rewards', () => {
	const result = estimateRewards({ ...input, isPercentageBased: true, costPercentage: 10 })!;
	expect(result.monthlyProfit).toBeCloseTo(result.monthlyRewardUSD * 0.9, 9);
});

test.each([{ nodeCost: 0 }, { isPercentageBased: true, costPercentage: 0 }])(
	'returns finite results and zero profit percentages for zero cost: %j',
	(overrides) => {
		const result = estimateRewards({ ...input, ...overrides })!;
		expect(result.monthlyProfitPercentage).toBe(0);
		expect(result.yearlyProfitPercentage).toBe(0);
		expect(Object.values(result).every(Number.isFinite)).toBe(true);
	}
);

test('does not mutate the input object or epoch rewards', () => {
	const original = structuredClone(input);
	const frozen = structuredClone(input);
	Object.freeze(frozen.epochRewards);
	Object.freeze(frozen);
	estimateRewards(frozen);
	expect(frozen).toEqual(original);
});

test('the calculator component delegates reward math to the model', () => {
	const source = readFileSync(
		new URL('../component/CalculatorComponent.svelte', import.meta.url),
		'utf8'
	);
	expect(source).toMatch(
		/import\s*\{\s*estimateRewards\s*\}\s*from\s*['"]\$lib\/rewards\/calculatorModel['"]/
	);
	expect(source).toMatch(/\bestimateRewards\s*\(/);
	expect(source).not.toContain('Binary search for threshold');
});
