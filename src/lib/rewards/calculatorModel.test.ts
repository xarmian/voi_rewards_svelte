import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
	BREAK_EVEN_SEARCH_LIMIT,
	estimateRewards,
	type Estimate,
	type EstimateInput
} from './calculatorModel';

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

const irregularInput: EstimateInput = {
	stake: 123456.789,
	price: 0.003721,
	onlineMoney: 1234567890000000,
	rewardStake: 987654321000000,
	epochRewards: Array.from({ length: 52 }, (_, i) => Math.round(3_000_000 * 0.97 ** i)),
	nodeCost: 17.83,
	isPercentageBased: false,
	costPercentage: 13.7
};

const breakEvenCases = [
	{ nodeCost: 5, price: 0.001, threshold: 101_000 },
	{ nodeCost: 50, price: 0.001, threshold: 1_010_000 },
	{ nodeCost: 604, price: 0.1, threshold: 122_100 },
	{ nodeCost: 0, price: 0.01, threshold: 0 }
];

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
	const result = estimateRewards(irregularInput)!;
	// Threshold uses the direct solve; all other values are from the pre-extraction implementation.
	// First five pools sum to 14_126_597: 18.0083 / (0.003721 * 14_126_597 / 987654321)
	// = 338361.1241473446 VOI, rounded up to 338400 instead of the search's 338500.
	const exact =
		(irregularInput.nodeCost * 1.01) /
		((irregularInput.price * irregularInput.epochRewards.slice(0, 5).reduce((a, b) => a + b, 0)) /
			(irregularInput.rewardStake / 1e6));
	expect(Math.ceil(exact / 100) * 100).toBe(338400);
	const expected: Estimate = {
		expectedWeeklyBlocks: 21.6,
		expectedMonthlyBlocks: 93.92914285714286,
		expectedYearlyBlocks: 1127.057142857143,
		apr: 15.794999999802561,
		apy: 8.372165173820312,
		profitabilityThreshold: 338400,
		breakEvenReached: true,
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
		expect(result[key], key).toBe(expected[key]);
	}
});

test.each(breakEvenCases)(
	'rounds the exact break-even up to $threshold VOI for cost $nodeCost and price $price',
	({ nodeCost, price, threshold }) => {
		expect(estimateRewards({ ...input, nodeCost, price })!.profitabilityThreshold).toBe(threshold);
	}
);

test.each([
	...breakEvenCases.map(({ nodeCost, price }) => ({ ...input, nodeCost, price })),
	irregularInput,
	input
])('covers the closed-form cost within 100 VOI for cost $nodeCost and price $price', (fixture) => {
	const monthlyPool = fixture.epochRewards.slice(0, 5).reduce((sum, reward) => sum + reward, 0);
	const exact =
		(fixture.nodeCost * 1.01) / ((fixture.price * monthlyPool) / (fixture.rewardStake / 1e6));
	const threshold = estimateRewards(fixture)!.profitabilityThreshold;
	expect(threshold).toBeGreaterThanOrEqual(exact - 1e-6);
	expect(threshold - exact).toBeLessThan(100 + 1e-6);
	expect(threshold % 100).toBe(0);
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
		'breakEvenReached',
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
	expect(result.profitabilityThreshold).toBe(0);
});

test.each([{ nodeCost: 0 }, { isPercentageBased: true, costPercentage: 0 }])(
	'returns finite results and zero profit percentages for zero cost: %j',
	(overrides) => {
		const result = estimateRewards({ ...input, ...overrides })!;
		expect(result.monthlyProfitPercentage).toBe(0);
		expect(result.yearlyProfitPercentage).toBe(0);
		expect(
			Object.entries(result).every(([key, value]) =>
				key === 'breakEvenReached' ? typeof value === 'boolean' : Number.isFinite(value)
			)
		).toBe(true);
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

test('percentage-based cost also drives the yearly profit fields', () => {
	const result = estimateRewards({ ...input, isPercentageBased: true, costPercentage: 10 })!;
	const monthlyCost = result.monthlyRewardUSD * 0.1;
	expect(result.yearlyProfit).toBeCloseTo(result.yearlyRewardUSD - monthlyCost * 12, 9);
	expect(result.yearlyProfitPercentage).toBeCloseTo(
		((result.yearlyRewardUSD - monthlyCost * 12) / (monthlyCost * 12)) * 100,
		9
	);
});

test.each([
	['NaN', Number.NaN],
	['zero', 0],
	['undefined', undefined as unknown as number]
])('returns null when online money is %s', (_name, onlineMoney) => {
	expect(estimateRewards({ ...input, onlineMoney })).toBeNull();
});

test('an epoch list shorter than a year still gives finite results', () => {
	const result = estimateRewards({ ...input, epochRewards: [1000, 900, 800, 700, 600] })!;
	expect(result.weeklyReward).toBe(10);
	expect(
		Object.entries(result).every(([key, value]) =>
			key === 'breakEvenReached' ? typeof value === 'boolean' : Number.isFinite(value)
		)
	).toBe(true);
});

test('the component assigns every model field to the variable of the same name', () => {
	const source = readFileSync(
		new URL('../component/CalculatorComponent.svelte', import.meta.url),
		'utf8'
	);
	// yearlyProfit is not shown anywhere, so the component does not keep it.
	const expected = Object.keys(estimateRewards(input)!)
		.filter((key) => key !== 'yearlyProfit')
		.sort();
	expect(expected).toContain('breakEvenReached');
	const assigned = [...source.matchAll(/^\s*(\w+) = estimate\.(\w+);$/gm)];
	for (const [line, variable, field] of assigned) expect(variable, line).toBe(field);
	expect(assigned.map((match) => match[2]).sort()).toEqual(expected);
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

test('reports when a high node cost at a low price cannot break even within the search limit', () => {
	const result = estimateRewards({ ...input, price: 0.001, nodeCost: 5000 })!;
	expect(BREAK_EVEN_SEARCH_LIMIT).toBe(10_000_000);
	expect(result.breakEvenReached).toBe(false);
});

test('reports a reached break-even at the directly solved normal threshold', () => {
	const result = estimateRewards(input)!;
	expect(result.breakEvenReached).toBe(true);
	// Direct solve: 10.1 / (0.05 * 0.01) = 20_200, replacing the search's 20_300.
	expect(result.profitabilityThreshold).toBe(20200);
});

test.each([0.001, 0.01, 1000])('a 100 percent node cost cannot break even at price %s', (price) => {
	const result = estimateRewards({
		...input,
		price,
		isPercentageBased: true,
		costPercentage: 100
	})!;
	expect(result.breakEvenReached).toBe(false);
	expect(result.profitabilityThreshold).toBe(BREAK_EVEN_SEARCH_LIMIT);
});

test('a percentage cost below the cutoff can break even', () => {
	expect(
		estimateRewards({ ...input, isPercentageBased: true, costPercentage: 50 })!.breakEvenReached
	).toBe(true);
});

test.each([
	{ factor: 1 - 1e-8, reached: true },
	{ factor: 1 + 1e-8, reached: false }
])('checks revenue at the limit despite the rounded threshold: $reached', ({ factor, reached }) => {
	// Five monthly epochs in this fixture; scale cost either side of revenue at the limit.
	const revenueAtLimit =
		(BREAK_EVEN_SEARCH_LIMIT / (input.rewardStake / 1e6)) * 1000 * 5 * input.price;
	const nodeCost = (revenueAtLimit / 1.01) * factor;
	const result = estimateRewards({ ...input, nodeCost })!;
	// Both thresholds round to the limit, so the threshold alone cannot distinguish them.
	expect(result.profitabilityThreshold).toBe(BREAK_EVEN_SEARCH_LIMIT);
	expect(result.breakEvenReached).toBe(reached);
});

test.each([0, -1])('break-even reachability is independent of a non-positive stake %s', (stake) => {
	for (const { nodeCost, price, reached } of [
		{ nodeCost: 10, price: 0.01, reached: true },
		{ nodeCost: 5000, price: 0.001, reached: false }
	]) {
		const result = estimateRewards({ ...input, stake, nodeCost, price })!;
		const positive = estimateRewards({ ...input, stake: 1000, nodeCost, price })!;
		expect(result.breakEvenReached).toBe(reached);
		expect(result.breakEvenReached).toBe(positive.breakEvenReached);
		expect(result.profitabilityThreshold).toBe(positive.profitabilityThreshold);
	}
});
