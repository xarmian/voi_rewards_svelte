<script lang="ts">
	import { getSupplyInfo } from '$lib/stores/accounts';
	import { dataTable } from '../../stores/dataTable';
	import { getTokensByEpoch } from '$lib/utils';
	import { onMount } from 'svelte';
	import { getAccountInfo } from '$lib/stores/accounts';
	import { getCurrentEpoch } from '$lib/utils/epoch-utils';
	import { voiPrice, fetchVoiPrice } from '$lib/stores/price';

	export let walletAddress: string | undefined = undefined;
	export let childAccounts: any[] = [];
	export let primaryAccountInfo: any | undefined = undefined;

	let nodeCost = 10; // Default $10/month
	let isPercentageBased = false; // Default to fixed cost
	let costPercentage = 10; // Default 10% of rewards
	let calculationAmount = 0; // Amount to use for calculations
	let walletBalance = 0; // Keep track of actual wallet balance
	let profitabilityThreshold = 0; // Amount needed to break even

	let initialBalance = 0;
	let additionalAmount = 0;
	const maxAdditionalAmount = 1000000; // 1M VOI as maximum
	const stepSize = 100; // Increment by 100 VOI
	let totalBalance = 0;
	let supply: any;
	let isLoading = true;
	let error = '';
	let rewardStake = 0;

	// Calculated metrics
	let weeklyReward = 0;
	let monthlyReward = 0;
	let yearlyReward = 0;
	let apr = 0;
	let apy = 0;

	// Add USD value metrics
	let weeklyRewardUSD = 0;
	let monthlyRewardUSD = 0;
	let yearlyRewardUSD = 0;
	let monthlyProfit = 0;
	let yearlyProfit = 0;
	let monthlyProfitPercentage = 0;
	let yearlyProfitPercentage = 0;
	let initialInvestmentUSD = 0;

	// Future balances
	let balanceAfterWeek = 0;
	let balanceAfterMonth = 0;
	let balanceAfterYear = 0;

	// Add new variables for block calculations
	let blocksPerDay = (24 * 60 * 60) / 2.8; // Assuming 2.8 seconds per block
	let weeklyBlocks = blocksPerDay * 7;
	let monthlyBlocks = blocksPerDay * 30.44;
	let yearlyBlocks = blocksPerDay * 365.25;

	// Add variables for block participation
	let expectedWeeklyBlocks = 0;
	let expectedMonthlyBlocks = 0;
	let expectedYearlyBlocks = 0;

	// Add new variables for epoch tracking
	let currentEpoch: number;
	let epochRewards: number[] = [];
	const EPOCHS_PER_YEAR = 52; // weekly epochs

	// Add new variables for reward schedule
	let isRewardScheduleVisible = false;
	let epochSchedule: Array<{
		epochNumber: number;
		startDate: Date;
		endDate: Date;
		rewardPool: number;
		isCurrent: boolean;
	}> = [];

	let isPastEpochsVisible = false;
	let pastEpochSchedule: Array<{
		epochNumber: number;
		startDate: Date;
		endDate: Date;
		rewardPool: number;
	}> = [];
	const PAST_EPOCHS_TO_SHOW = 12; // Show last 3 months
	const EPOCH_START_DATE = new Date('2024-10-30');

	let customPrice: number | null = null;
	let useCustomPrice = false;

	let maxSliderValueUSD = 1000; // $1000 USD max
	let sliderValue = 10; // Default $10

	let inputMode: 'usd' | 'voi' = 'usd'; // Default to USD mode
	let calculationAmountUSD = 10; // Default $10

	let tooltipVisible = {
		totalStake: false,
		breakEven: false,
		annualReturns: false,
		fixedAmount: false,
		percentage: false
	};

	function showTooltip(key: keyof typeof tooltipVisible) {
		tooltipVisible[key] = true;
	}

	function hideTooltip(key: keyof typeof tooltipVisible) {
		tooltipVisible[key] = false;
	}

	function toggleTooltip(key: keyof typeof tooltipVisible) {
		tooltipVisible[key] = !tooltipVisible[key];
	}

	function handleSliderChange(event: Event) {
		const value = Number((event.target as HTMLInputElement).value);
		// Slider always controls USD value
		calculationAmountUSD = Math.round(value * 100) / 100;
		sliderValue = value;
		if (effectivePrice > 0) {
			calculationAmount = value / effectivePrice;
		}
		calculateRewards();
	}

	function handleInputChange() {
		// VOI input changed - update USD and slider
		if (effectivePrice > 0) {
			calculationAmountUSD = Math.round(calculationAmount * effectivePrice * 100) / 100;
			sliderValue = calculationAmountUSD;
		}
		calculateRewards();
	}

	function handleUSDInputChange() {
		calculationAmountUSD = Math.round(calculationAmountUSD * 100) / 100;
		sliderValue = calculationAmountUSD;
		if (effectivePrice > 0) {
			calculationAmount = calculationAmountUSD / effectivePrice;
		}
		calculateRewards();
	}

	function setUSDAmount(usdAmount: number) {
		calculationAmountUSD = usdAmount;
		sliderValue = usdAmount;
		if (effectivePrice > 0) {
			calculationAmount = usdAmount / effectivePrice;
		}
		calculateRewards();
	}

	$: effectivePrice = useCustomPrice && customPrice !== null ? customPrice : $voiPrice.price;

	// Force VOI mode when price is unavailable
	$: if (effectivePrice <= 0) {
		inputMode = 'voi';
	}

	// Initialize stake amount when price first becomes available
	let priceInitialized = false;
	$: if (effectivePrice > 0 && !priceInitialized) {
		// If wallet is connected, use wallet balance; otherwise use default $10
		if (walletBalance > 0) {
			calculationAmount = walletBalance;
			calculationAmountUSD = Math.round(walletBalance * effectivePrice * 100) / 100;
			sliderValue = calculationAmountUSD;
		} else {
			calculationAmount = calculationAmountUSD / effectivePrice;
		}
		priceInitialized = true;
		// Use tick to avoid reactive cycle
		setTimeout(() => calculateRewards(), 0);
	}

	function toggleCustomPrice() {
		if (!useCustomPrice) {
			customPrice = Math.round($voiPrice.price * 1e8) / 1e8;
		}
		useCustomPrice = !useCustomPrice;
		calculateRewards();
	}

	async function updateWalletBalance() {
		if (walletAddress) {
			try {
				const accountInfo = await getAccountInfo(walletAddress);
				const newBalance = Number(accountInfo?.amount || 0) / 1e6;
				if (newBalance !== walletBalance) {
					walletBalance = newBalance;
					calculationAmount = walletBalance;
					if (effectivePrice > 0) {
						calculationAmountUSD = Math.round(walletBalance * effectivePrice * 100) / 100;
						sliderValue = calculationAmountUSD;
					}
					calculateRewards();
				}
			} catch (error) {
				console.error('Error updating wallet balance:', error);
				walletBalance = 0;
				calculationAmount = 0;
				calculationAmountUSD = 0;
				sliderValue = 0;
				calculateRewards();
			}
		}
	}

	function setCalculationAmount(multiplier: number) {
		calculationAmount = walletBalance * multiplier;
		if (effectivePrice > 0) {
			calculationAmountUSD = Math.round(calculationAmount * effectivePrice * 100) / 100;
			sliderValue = calculationAmountUSD;
		}
		calculateRewards();
	}

	function setFixedAmount(amount: number) {
		calculationAmount = amount;
		if (effectivePrice > 0) {
			calculationAmountUSD = Math.round(amount * effectivePrice * 100) / 100;
			sliderValue = calculationAmountUSD;
		}
		calculateRewards();
	}

	function resetToWalletBalance() {
		calculationAmount = walletBalance;
		if (effectivePrice > 0) {
			calculationAmountUSD = Math.round(walletBalance * effectivePrice * 100) / 100;
			sliderValue = calculationAmountUSD;
		}
		calculateRewards();
	}

	// Initialize data
	onMount(async () => {
		try {
			// Fetch VOI price if not already set
			await fetchVoiPrice();

			const [supplyData, dates] = await Promise.all([getSupplyInfo(), dataTable.fetchDateRanges()]);

			supply = supplyData;

			const latestEpoch = dates[dates.length - 1];

			currentEpoch = latestEpoch.epoch;

			// Fetch next year's worth of epoch rewards
			const epochPromises = Array.from({ length: EPOCHS_PER_YEAR }, (_, i) =>
				getTokensByEpoch(currentEpoch + i)
			);
			epochRewards = await Promise.all(epochPromises);

			const epochData = await dataTable.fetchData(latestEpoch.id);

			if (epochData && supply?.['online-money']) {
				rewardStake =
					Number(supply['online-money']) - Number(epochData?.blacklist_balance_total);

				if (walletAddress) {
					await updateWalletBalance();
				} else if (additionalAmount > 0) {
					calculateRewards();
				}
			}

			isLoading = false;

			await initializeEpochSchedule();
		} catch (err) {
			console.error('Mount error:', err);
			error = 'Error loading data. Please try again later.';
			isLoading = false;
		}
	});

	async function initializeEpochSchedule() {
		const currentDate = new Date();
		const currentEpochNumber = getCurrentEpoch(currentDate, EPOCH_START_DATE);

		// Initialize future epochs
		epochSchedule = Array.from({ length: EPOCHS_PER_YEAR }, (_, i) => {
			const epochStartDate = new Date(EPOCH_START_DATE);
			epochStartDate.setDate(EPOCH_START_DATE.getDate() + (currentEpochNumber + i) * 7);
			const epochEndDate = new Date(epochStartDate);
			epochEndDate.setDate(epochStartDate.getDate() + 7 - 1);

			return {
				epochNumber: currentEpochNumber + i,
				startDate: epochStartDate,
				endDate: epochEndDate,
				rewardPool: epochRewards[i] || 0,
				isCurrent: isCurrentEpoch(epochStartDate, epochEndDate, currentDate)
			};
		});

		// Initialize past epochs, but only for dates after EPOCH_START_DATE
		const maxPastEpochs = Math.min(
			PAST_EPOCHS_TO_SHOW,
			currentEpochNumber // This limits past epochs to not go before epoch 0
		);

		if (maxPastEpochs > 0) {
			// get historical rewards
			const pastEpochPromises = Array.from({ length: maxPastEpochs }, (_, i) => {
				return getTokensByEpoch(currentEpochNumber - (maxPastEpochs - i) + 1);
			});

			const pastEpochRewards = await Promise.all(pastEpochPromises);

			pastEpochSchedule = Array.from({ length: maxPastEpochs }, (_, i) => {
				const epochNumber = currentEpochNumber - (maxPastEpochs - i);
				const epochStartDate = new Date(EPOCH_START_DATE);
				epochStartDate.setDate(EPOCH_START_DATE.getDate() + epochNumber * 7);
				const epochEndDate = new Date(epochStartDate);
				epochEndDate.setDate(epochStartDate.getDate() + 7 - 1);
				const rewardPool = pastEpochRewards[i] || 0;

				return {
					epochNumber,
					startDate: epochStartDate,
					endDate: epochEndDate,
					rewardPool: rewardPool,
					isCurrent: false
				};
			});
		} else {
			// If we're in the first epoch, don't show the past epochs button
			pastEpochSchedule = [];
		}
	}

	function isCurrentEpoch(start: Date, end: Date, current: Date): boolean {
		return current >= start && current <= end;
	}

	function calculateRewards() {
		totalBalance = calculationAmount;
		initialInvestmentUSD = totalBalance * effectivePrice;

		if (!supply?.['online-money'] || !rewardStake || rewardStake <= 0) {
			return;
		}

		// Calculate with 1 VOI if balance is 0 to show potential rates
		const calculationBalance = totalBalance > 0 ? totalBalance : 1;

		const onlineMoney = Number(supply['online-money']);
		let shareOfStake = calculationBalance / (rewardStake / 1e6);
		let shareOfTotalStake = calculationBalance / (onlineMoney / 1e6);

		// Calculate expected blocks based on stake share
		expectedWeeklyBlocks = weeklyBlocks * shareOfTotalStake;
		expectedMonthlyBlocks = monthlyBlocks * shareOfTotalStake;
		expectedYearlyBlocks = yearlyBlocks * shareOfTotalStake;

		// Calculate APR and potential APY regardless of balance
		let potentialWeeklyReward = shareOfStake * epochRewards[0];
		apr = (potentialWeeklyReward / calculationBalance) * 52 * 100;

		// Calculate potential APY with compound interest
		let simulatedBalance = calculationBalance;
		let currentShareOfStake = shareOfStake;
		for (let i = 0; i < EPOCHS_PER_YEAR && i < epochRewards.length; i++) {
			const epochReward = calculateEpochReward(currentShareOfStake, epochRewards[i]);
			simulatedBalance += epochReward;
			currentShareOfStake = simulatedBalance / (rewardStake / 1e6);
		}
		apy = (simulatedBalance / calculationBalance - 1) * 100;

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
			let testShareOfStake = testAmount / (rewardStake / 1e6);

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
		profitabilityThreshold = Math.ceil(testAmount / 100) * 100;

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
			monthlyProfitPercentage = (monthlyProfit / effectiveNodeCost) * 100;

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
			yearlyProfitPercentage = (yearlyProfit / yearlyNodeCost) * 100;

			balanceAfterWeek = totalBalance + weeklyReward;
			balanceAfterMonth = totalBalance + monthlyReward;
			balanceAfterYear = actualBalance;
		} else {
			// Reset all values when there's no balance
			resetCalculations();
		}
	}

	function resetCalculations() {
		weeklyReward = 0;
		monthlyReward = 0;
		yearlyReward = 0;
		weeklyRewardUSD = 0;
		monthlyRewardUSD = 0;
		yearlyRewardUSD = 0;
		monthlyProfit = 0;
		yearlyProfit = 0;
		monthlyProfitPercentage = 0;
		yearlyProfitPercentage = 0;
		balanceAfterWeek = 0;
		balanceAfterMonth = 0;
		balanceAfterYear = 0;
	}

	// Helper function to calculate rewards for a specific epoch
	function calculateEpochReward(shareOfStake: number, epochRewardPool: number): number {
		return shareOfStake * epochRewardPool;
	}

	// Format currency for USD values
	function formatUSD(value: number, maxDecimals: number = 2): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: maxDecimals,
			maximumFractionDigits: maxDecimals
		}).format(value);
	}

	// Add reactivity for node cost changes
	$: {
		if (!isLoading && rewardStake > 0 && supply?.['online-money']) {
			calculateRewards();
		}
	}

	// Add node cost reactivity
	$: {
		if (nodeCost !== undefined) {
			calculateRewards();
		}
	}

	// Add wallet address reactivity
	$: {
		if (!isLoading && walletAddress && rewardStake > 0 && supply?.['online-money']) {
			updateWalletBalance();
		}
	}

	// Update the calculateRewards function to use effectivePrice instead of $voiPrice
	$: {
		if (effectivePrice !== undefined) {
			calculateRewards();
		}
	}

	function formatDate(date: Date): string {
		return (
			date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				timeZone: 'UTC'
			}) + ' UTC'
		);
	}

	function adjustCustomPrice(percentChange: number) {
		if (customPrice !== null) {
			customPrice = Math.max(0, customPrice * (1 + percentChange));
			calculateRewards();
		}
	}

	let isDownloadingCSV = false;

	async function downloadEpochScheduleCSV() {
		isDownloadingCSV = true;
		try {
			const TOTAL_EPOCHS = 20 * 52; // 20 years × 52 weeks
			const csvRows: string[] = ['startDate,endDate,nodeAamount,relayAmount'];

			// Generate all epochs from epoch 0 to epoch 1039
			for (let epoch = 0; epoch < TOTAL_EPOCHS; epoch++) {
				// Calculate start date: EPOCH_START_DATE + (epoch * 7 days)
				const epochStartDate = new Date(EPOCH_START_DATE);
				epochStartDate.setDate(EPOCH_START_DATE.getDate() + epoch * 7);

				// Calculate end date: startDate + 6 days (7-day epoch, endDate inclusive)
				const epochEndDate = new Date(epochStartDate);
				epochEndDate.setDate(epochStartDate.getDate() + 6);

				// Fetch amount using getTokensByEpoch(epoch + 1)
				// Since epoch 1 = 3M tokens in the formula
				const amount = await getTokensByEpoch(epoch + 1);

				// Format dates as ISO strings (YYYY-MM-DD)
				const startDateStr = epochStartDate.toISOString().split('T')[0];
				const endDateStr = epochEndDate.toISOString().split('T')[0];

				// Add row to CSV
				csvRows.push(
					`${startDateStr},${endDateStr},${Math.round(amount)},${Math.round(amount / 10)}`
				);
			}

			// Create CSV content
			const csvContent = csvRows.join('\n');

			// Create blob and trigger download
			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
			const link = document.createElement('a');
			const url = URL.createObjectURL(blob);
			link.setAttribute('href', url);
			link.setAttribute(
				'download',
				`epoch-schedule-${EPOCH_START_DATE.toISOString().split('T')[0]}.csv`
			);
			link.style.visibility = 'hidden';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Error generating CSV:', error);
			alert('Failed to generate CSV. Please try again.');
		} finally {
			isDownloadingCSV = false;
		}
	}
</script>

<div class="space-y-6">
	{#if error}
		<div class="p-4 bg-red-100 text-red-700 rounded-lg">
			{error}
		</div>
	{:else if isLoading}
		<div class="p-4 text-gray-600 dark:text-gray-400">Loading calculator data...</div>
	{:else}
		<!-- Input Section -->
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
			<div class="space-y-4">
				<div class="flex items-center justify-between mb-2">
					<label
						for="calculationAmount"
						class="block text-lg font-semibold text-gray-900 dark:text-gray-100"
					>
						Stake Amount
					</label>
					{#if effectivePrice > 0}
						<div
							class="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800"
						>
							<button
								class="px-3 py-1 text-sm font-medium rounded-md transition-colors duration-200 {inputMode ===
								'usd'
									? 'bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 shadow-sm'
									: 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
								on:click={() => (inputMode = 'usd')}
							>
								USD
							</button>
							<button
								class="px-3 py-1 text-sm font-medium rounded-md transition-colors duration-200 {inputMode ===
								'voi'
									? 'bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 shadow-sm'
									: 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
								on:click={() => (inputMode = 'voi')}
							>
								VOI
							</button>
						</div>
					{/if}
				</div>
				<div class="space-y-4">
					<div class="flex items-center space-x-4">
						<div class="flex-1">
							{#if inputMode === 'usd' && effectivePrice > 0}
								<div class="relative">
									<span
										class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium text-2xl"
									>
										$
									</span>
									<input
										type="number"
										id="calculationAmountUSD"
										bind:value={calculationAmountUSD}
										min="0"
										step="0.01"
										class="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-2xl font-bold pl-8 pr-4"
										on:change={handleUSDInputChange}
									/>
								</div>
								<p class="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">
									{Math.round(calculationAmount).toLocaleString()} VOI
								</p>
							{:else}
								<div class="relative">
									<input
										type="number"
										id="calculationAmount"
										bind:value={calculationAmount}
										min="0"
										step="1"
										class="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-2xl font-bold pl-4 pr-12"
										on:change={handleInputChange}
									/>
									<span
										class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium"
									>
										VOI
									</span>
								</div>
								{#if calculationAmount > 0 && effectivePrice > 0}
									<p class="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">
										Value: {formatUSD(calculationAmount * effectivePrice)}
									</p>
								{/if}
							{/if}
						</div>
					</div>

					<div class="space-y-2">
						<input
							type="range"
							bind:value={sliderValue}
							min="0"
							max={maxSliderValueUSD}
							step="1"
							class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-500"
							on:input={handleSliderChange}
						/>
						<div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
							{#if inputMode === 'voi' && effectivePrice > 0}
								<span>0 VOI</span>
								<span
									>{Math.round(maxSliderValueUSD / 2 / effectivePrice).toLocaleString()} VOI</span
								>
								<span>{Math.round(maxSliderValueUSD / effectivePrice).toLocaleString()} VOI</span>
							{:else}
								<span>$0</span>
								<span>${maxSliderValueUSD / 2}</span>
								<span>${maxSliderValueUSD}</span>
							{/if}
						</div>
					</div>
				</div>

				<!-- Quick Select Buttons -->
				<div class="mt-6">
					<p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quick Select</p>
					<div class="flex flex-wrap gap-2">
						{#if walletBalance > 0}
							<button
								class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border-2
                                        {calculationAmount === walletBalance
									? 'border-purple-500 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
									: 'border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/50 hover:border-purple-300 dark:hover:border-purple-700'}
                                        transition-all duration-200 group"
								on:click={resetToWalletBalance}
							>
								<div class="flex flex-col items-center">
									<i
										class="fas fa-wallet mb-1 text-lg text-gray-500 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-300"
									></i>
									<span
										class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-300"
										>Wallet</span
									>
									{#if effectivePrice > 0}
										<span class="font-bold">{formatUSD(walletBalance * effectivePrice)}</span>
									{:else}
										<span class="font-bold">{walletBalance.toLocaleString()} VOI</span>
									{/if}
								</div>
							</button>
						{/if}
						<!-- USD Quick Select Buttons -->
						{#if effectivePrice > 0}
							{#each [10, 100, 1000] as usdAmount}
								<button
									class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border-2
                                            {calculationAmountUSD === usdAmount
										? 'border-purple-500 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
										: 'border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/50 hover:border-purple-300 dark:hover:border-purple-700'}
                                            transition-all duration-200 group"
									on:click={() => setUSDAmount(usdAmount)}
								>
									<div class="flex flex-col items-center">
										<i
											class="fas fa-dollar-sign mb-1 text-lg text-gray-500 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-300"
										></i>
										<span class="font-bold text-sm">${usdAmount}</span>
										<span class="text-xs text-gray-400"
											>{Math.round(usdAmount / effectivePrice).toLocaleString()} VOI</span
										>
									</div>
								</button>
							{/each}
						{/if}
					</div>
					<!-- VOI Price Inline -->
					<div
						class="mt-4 flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
					>
						<div class="flex items-center gap-3">
							<span class="text-sm text-gray-500 dark:text-gray-400">VOI Price:</span>
							{#if useCustomPrice}
								<div class="flex items-center gap-2">
									<span class="text-gray-400">$</span>
									<input
										type="number"
										bind:value={customPrice}
										min="0"
										step="0.00000001"
										class="w-28 px-2 py-1 rounded border-gray-300 dark:bg-gray-600 dark:border-gray-500 dark:text-white text-sm font-bold"
										on:change={() => calculateRewards()}
									/>
									<div class="flex gap-1">
										<button
											class="px-1.5 py-0.5 text-xs rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
											on:click={() => adjustCustomPrice(-0.05)}
										>
											-5%
										</button>
										<button
											class="px-1.5 py-0.5 text-xs rounded border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
											on:click={() => adjustCustomPrice(0.05)}
										>
											+5%
										</button>
									</div>
								</div>
							{:else}
								<span class="font-bold text-purple-600 dark:text-purple-400">
									{$voiPrice.price > 0 ? formatUSD($voiPrice.price, 6) : 'Loading...'}
								</span>
								<button
									class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full transition-colors"
									on:click={() => fetchVoiPrice(true)}
									aria-label="Refresh price"
								>
									<svg
										class="w-3.5 h-3.5 text-gray-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
										/>
									</svg>
								</button>
							{/if}
							<button
								class="text-xs text-purple-600 dark:text-purple-400 hover:underline"
								on:click={toggleCustomPrice}
							>
								{useCustomPrice ? 'Use market' : 'Custom'}
							</button>
						</div>
						{#if effectivePrice > 0}
							<p class="text-xs text-gray-400 italic">USD estimates based on current rate</p>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Reward Hero Section -->
		<div
			class="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-800 dark:to-purple-900/20 rounded-2xl shadow-lg p-6 border border-purple-200 dark:border-purple-800"
		>
			<h3
				class="text-center text-xl font-bold mb-6 text-gray-900 dark:text-gray-100 flex items-center justify-center"
			>
				<svg
					class="w-6 h-6 mr-2 text-purple-500"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
					></path>
				</svg>
				Your Estimated Rewards
			</h3>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
				<!-- Weekly (smaller) -->
				<div class="text-center p-4 bg-white/50 dark:bg-gray-700/50 rounded-xl">
					<p class="text-sm text-gray-500 dark:text-gray-400 mb-1">Weekly</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
						{weeklyReward.toFixed(0)} VOI
					</p>
					{#if effectivePrice > 0}
						<p class="text-sm text-gray-400">{formatUSD(weeklyRewardUSD)}</p>
					{/if}
				</div>

				<!-- Monthly (HERO - emphasized) -->
				<div
					class="text-center p-6 bg-white dark:bg-gray-700 rounded-xl shadow-lg md:transform md:scale-105 border-2 border-purple-300 dark:border-purple-600"
				>
					<p class="text-sm font-medium text-purple-600 dark:text-purple-400 mb-1">Monthly</p>
					<p class="text-4xl font-bold text-purple-600 dark:text-purple-400">
						{monthlyReward.toFixed(0)} VOI
					</p>
					{#if effectivePrice > 0}
						<p class="text-lg text-purple-400 dark:text-purple-300">
							{formatUSD(monthlyRewardUSD)}
						</p>
					{/if}
				</div>

				<!-- Yearly (smaller) -->
				<div class="text-center p-4 bg-white/50 dark:bg-gray-700/50 rounded-xl">
					<p class="text-sm text-gray-500 dark:text-gray-400 mb-1">Yearly</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
						{yearlyReward.toFixed(0)} VOI
					</p>
					{#if effectivePrice > 0}
						<p class="text-sm text-gray-400">{formatUSD(yearlyRewardUSD)}</p>
					{/if}
				</div>
			</div>

			<!-- APY/APR footer -->
			<div
				class="flex flex-wrap justify-center gap-4 md:gap-6 mt-6 text-sm text-gray-600 dark:text-gray-400"
			>
				<span
					>APY: <strong class="text-green-600 dark:text-green-400">{apy.toFixed(2)}%</strong></span
				>
				<span>APR: <strong>{apr.toFixed(2)}%</strong></span>
			</div>
		</div>

		<!-- Profitability Analysis -->
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-5">
			<h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
				Profitability Analysis
			</h3>

			<!-- Cost Input -->
			<div class="mb-5">
				<div class="flex items-end justify-center gap-3">
					<div class="flex flex-col items-center">
						<label class="text-sm text-gray-600 dark:text-gray-400 mb-2"> Monthly node cost </label>
						<div class="flex items-center gap-2">
							<button
								class="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xl font-bold transition-colors"
								on:click={() => {
									nodeCost = Math.max(0, nodeCost - 1);
									calculateRewards();
								}}
							>
								−
							</button>
							<div class="relative">
								<span
									class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-lg"
									>$</span
								>
								<input
									type="number"
									bind:value={nodeCost}
									min="0"
									step="1"
									class="w-24 pl-7 pr-3 py-2 text-lg font-medium rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-center"
									on:change={() => calculateRewards()}
								/>
							</div>
							<button
								class="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xl font-bold transition-colors"
								on:click={() => {
									nodeCost = nodeCost + 1;
									calculateRewards();
								}}
							>
								+
							</button>
						</div>
					</div>
					<span class="text-sm text-gray-500 dark:text-gray-400 pb-3">per month</span>
				</div>
			</div>

			<!-- Break-even Display -->
			<div
				class="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
			>
				<span class="text-sm text-gray-600 dark:text-gray-400">Break-even stake</span>
				<button
					class="text-base font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
					on:click={() => setFixedAmount(profitabilityThreshold)}
					title="Set stake to break-even amount"
				>
					{profitabilityThreshold.toLocaleString()} VOI
					{#if effectivePrice > 0}
						<span class="text-sm text-gray-400 font-normal ml-1">
							({formatUSD(profitabilityThreshold * effectivePrice)})
						</span>
					{/if}
				</button>
			</div>

			<!-- Nautilus suggestion -->
			{#if monthlyProfit < 0}
				<p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
					Not profitable at this stake? Consider
					<a
						href="https://nautilus.sh/#/staking"
						target="_blank"
						rel="noopener noreferrer"
						class="text-blue-600 dark:text-blue-400 hover:underline"
					>
						Nautilus Staking
					</a>
					for a lower-cost option.
				</p>
			{/if}
		</div>

		<!-- Reward Schedule -->
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
			<div class="flex items-center justify-between px-6 py-4">
				<button
					class="flex-1 text-left flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 -mx-6 px-6 py-4"
					on:click={() => (isRewardScheduleVisible = !isRewardScheduleVisible)}
				>
					<span class="text-lg font-semibold text-gray-900 dark:text-gray-100">
						View Reward Schedule
					</span>
					<svg
						class="w-5 h-5 transform transition-transform duration-200 {isRewardScheduleVisible
							? 'rotate-180'
							: ''}"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</button>
				<button
					class="ml-4 px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
					on:click={downloadEpochScheduleCSV}
					disabled={isDownloadingCSV}
				>
					{#if isDownloadingCSV}
						<svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							></path>
						</svg>
						<span>Generating...</span>
					{:else}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							/>
						</svg>
						<span>Download CSV</span>
					{/if}
				</button>
			</div>

			{#if isRewardScheduleVisible}
				<div class="overflow-x-auto">
					{#if PAST_EPOCHS_TO_SHOW > 0}
						<button
							class="w-full px-6 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700"
							on:click={() => (isPastEpochsVisible = !isPastEpochsVisible)}
						>
							{isPastEpochsVisible ? 'Hide' : 'Show'} Previous Epochs
						</button>
					{/if}

					<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
						<thead class="bg-gray-50 dark:bg-gray-700">
							<tr>
								<th
									class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
								>
									Epoch
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
								>
									Date Range
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
								>
									Reward Pool
								</th>
							</tr>
						</thead>
						<tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
							{#if isPastEpochsVisible}
								{#each pastEpochSchedule as epoch}
									<tr
										class="text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
									>
										<td class="px-6 py-4 whitespace-nowrap text-sm">
											{epoch.epochNumber + 1}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm">
											{formatDate(epoch.startDate)} - {formatDate(epoch.endDate)}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm">
											{epoch.rewardPool.toLocaleString(undefined, {
												maximumFractionDigits: 0
											})} VOI
										</td>
									</tr>
								{/each}
							{/if}

							{#each epochSchedule as epoch}
								<tr
									class="hover:bg-gray-50 dark:hover:bg-gray-700 {epoch.isCurrent
										? 'bg-purple-50 dark:bg-purple-900/20'
										: ''}"
								>
									<td
										class="px-6 py-4 whitespace-nowrap text-sm font-medium {epoch.isCurrent
											? 'text-purple-600 dark:text-purple-400'
											: 'text-gray-900 dark:text-gray-100'}"
									>
										{epoch.epochNumber + 1}
										{#if epoch.isCurrent}
											<span
												class="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
											>
												Current
											</span>
										{/if}
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
										{formatDate(epoch.startDate)} - {formatDate(epoch.endDate)}
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
										{epoch.rewardPool.toLocaleString(undefined, {
											maximumFractionDigits: 0
										})} VOI
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<!-- Additional Info -->
		<div
			class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm text-gray-600 dark:text-gray-400"
		>
			<p>* Calculations assume current network conditions and weekly compounding of rewards.</p>
			<p>* Actual rewards and rates may vary based on network participation and other factors.</p>
			<p>* This tool is for entertainment purposes only. It is not financial advice.</p>
		</div>
	{/if}
</div>
