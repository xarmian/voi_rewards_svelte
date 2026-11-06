export type EstimateInput = {
	stake: number; // VOI to estimate
	price: number; // USD per VOI
	onlineMoney: number; // micro-VOI
	rewardStake: number; // micro-VOI, excluding the epoch blacklist balance
	epochRewards: number[]; // VOI reward pool per epoch, current epoch first
	nodeCost: number; // USD per month when not percentage based
	isPercentageBased: boolean;
	costPercentage: number; // percent of monthly rewards
};

export type Estimate = {
	expectedWeeklyBlocks: number;
	expectedMonthlyBlocks: number;
	expectedYearlyBlocks: number;
	apr: number;
	apy: number;
	profitabilityThreshold: number;
	weeklyReward: number;
	weeklyRewardUSD: number;
	monthlyReward: number;
	monthlyRewardUSD: number;
	monthlyProfit: number;
	monthlyProfitPercentage: number;
	yearlyReward: number;
	yearlyRewardUSD: number;
	yearlyProfit: number;
	yearlyProfitPercentage: number;
	balanceAfterWeek: number;
	balanceAfterMonth: number;
	balanceAfterYear: number;
};

export function estimateRewards(input: EstimateInput): Estimate | null {
	const {
		stake: totalBalance,
		price: effectivePrice,
		onlineMoney,
		rewardStake,
		epochRewards,
		nodeCost,
		isPercentageBased,
		costPercentage
	} = input;
	const blocksPerDay = (24 * 60 * 60) / 2.8; // Assuming 2.8 seconds per block
	const weeklyBlocks = blocksPerDay * 7;
	const monthlyBlocks = blocksPerDay * 30.44;
	const yearlyBlocks = blocksPerDay * 365.25;
	const EPOCHS_PER_YEAR = 52; // weekly epochs

	// Caller owns guards for zero price and missing epochRewards[0]; keep the legacy math.
	// Zero reward/profit/balance fields replace resetCalculations() for non-positive stakes.
	let weeklyReward = 0;
	let weeklyRewardUSD = 0;
	let monthlyReward = 0;
	let monthlyRewardUSD = 0;
	let monthlyProfit = 0;
	let monthlyProfitPercentage = 0;
	let yearlyReward = 0;
	let yearlyRewardUSD = 0;
	let yearlyProfit = 0;
	let yearlyProfitPercentage = 0;
	let balanceAfterWeek = 0;
	let balanceAfterMonth = 0;
	let balanceAfterYear = 0;

	if (!onlineMoney || !rewardStake || rewardStake <= 0) {
		return null;
	}

	// Calculate with 1 VOI if balance is 0 to show potential rates
	const calculationBalance = totalBalance > 0 ? totalBalance : 1;

	const shareOfStake = calculationBalance / (rewardStake / 1e6);
	const shareOfTotalStake = calculationBalance / (onlineMoney / 1e6);

	// Calculate expected blocks based on stake share
	const expectedWeeklyBlocks = weeklyBlocks * shareOfTotalStake;
	const expectedMonthlyBlocks = monthlyBlocks * shareOfTotalStake;
	const expectedYearlyBlocks = yearlyBlocks * shareOfTotalStake;

	// Calculate APR and potential APY regardless of balance
	const potentialWeeklyReward = shareOfStake * epochRewards[0];
	const apr = (potentialWeeklyReward / calculationBalance) * 52 * 100;

	// Calculate potential APY with compound interest
	let simulatedBalance = calculationBalance;
	let currentShareOfStake = shareOfStake;
	for (let i = 0; i < EPOCHS_PER_YEAR && i < epochRewards.length; i++) {
		const epochReward = calculateEpochReward(currentShareOfStake, epochRewards[i]);
		simulatedBalance += epochReward;
		currentShareOfStake = simulatedBalance / (rewardStake / 1e6);
	}
	const apy = (simulatedBalance / calculationBalance - 1) * 100;

	// Calculate profitability threshold regardless of total balance
	let testAmount = 1000; // Start with 1000 VOI
	let monthlyRevenueAtTest = 0;

	// Binary search for threshold
	let min = 0;
	let max = 10_000_000; // 10M VOI as upper limit
	let iterations = 0;
	const maxIterations = 20; // Prevent infinite loops

	while (min <= max && iterations < maxIterations) {
		testAmount = Math.floor((min + max) / 2);
		const testShareOfStake = testAmount / (rewardStake / 1e6);

		// Calculate monthly rewards at test amount
		let testMonthlyReward = 0;
		const monthlyEpochs = 30.44 / 7;

		for (let i = 0; i < monthlyEpochs && i < epochRewards.length; i++) {
			testMonthlyReward += testShareOfStake * epochRewards[i];
		}

		monthlyRevenueAtTest = testMonthlyReward * effectivePrice;
		const testNodeCost = isPercentageBased
			? monthlyRevenueAtTest * (costPercentage / 100)
			: nodeCost;

		// Ensure we're slightly above the node cost
		const targetRevenue = testNodeCost * 1.01; // Target 1% above node cost

		if (Math.abs(monthlyRevenueAtTest - targetRevenue) < 0.01) {
			break;
		} else if (monthlyRevenueAtTest < targetRevenue) {
			min = testAmount + 1;
		} else {
			max = testAmount - 1;
		}

		iterations++;
	}

	// Round up to the nearest 100 VOI for a safety margin
	const profitabilityThreshold = Math.ceil(testAmount / 100) * 100;

	if (totalBalance > 0) {
		// Weekly reward (using current epoch)
		weeklyReward = shareOfStake * epochRewards[0];
		weeklyRewardUSD = weeklyReward * effectivePrice;

		// Monthly reward (approximately 4.33 weeks)
		const monthlyEpochs = 30.44 / 7;
		monthlyReward = 0;
		for (let i = 0; i < monthlyEpochs && i < epochRewards.length; i++) {
			const epochReward = calculateEpochReward(shareOfStake, epochRewards[i]);
			monthlyReward += epochReward;
		}
		monthlyRewardUSD = monthlyReward * effectivePrice;

		// Calculate node cost based on type
		const effectiveNodeCost = isPercentageBased
			? monthlyRewardUSD * (costPercentage / 100)
			: nodeCost;

		monthlyProfit = monthlyRewardUSD - effectiveNodeCost;
		monthlyProfitPercentage =
			effectiveNodeCost === 0 ? 0 : (monthlyProfit / effectiveNodeCost) * 100;

		// Yearly reward with compound interest
		yearlyReward = 0;
		let actualBalance = totalBalance;
		currentShareOfStake = shareOfStake;
		for (let i = 0; i < EPOCHS_PER_YEAR && i < epochRewards.length; i++) {
			const epochReward = calculateEpochReward(currentShareOfStake, epochRewards[i]);
			yearlyReward += epochReward;
			actualBalance += epochReward;
			currentShareOfStake = actualBalance / (rewardStake / 1e6);
		}
		yearlyRewardUSD = yearlyReward * effectivePrice;
		const yearlyNodeCost = effectiveNodeCost * 12;
		yearlyProfit = yearlyRewardUSD - yearlyNodeCost;
		yearlyProfitPercentage = yearlyNodeCost === 0 ? 0 : (yearlyProfit / yearlyNodeCost) * 100;

		balanceAfterWeek = totalBalance + weeklyReward;
		balanceAfterMonth = totalBalance + monthlyReward;
		balanceAfterYear = actualBalance;
	}

	return {
		expectedWeeklyBlocks,
		expectedMonthlyBlocks,
		expectedYearlyBlocks,
		apr,
		apy,
		profitabilityThreshold,
		weeklyReward,
		weeklyRewardUSD,
		monthlyReward,
		monthlyRewardUSD,
		monthlyProfit,
		monthlyProfitPercentage,
		yearlyReward,
		yearlyRewardUSD,
		yearlyProfit,
		yearlyProfitPercentage,
		balanceAfterWeek,
		balanceAfterMonth,
		balanceAfterYear
	};
}

function calculateEpochReward(shareOfStake: number, epochRewardPool: number): number {
	return shareOfStake * epochRewardPool;
}
