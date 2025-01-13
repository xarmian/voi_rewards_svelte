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
    export let primaryAccountInfo: any;
    
    let nodeCost = 15; // Default $15/month
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
        epochNumber: number,
        startDate: Date,
        endDate: Date,
        rewardPool: number,
        isCurrent: boolean
    }> = [];

    let isPastEpochsVisible = false;
    let pastEpochSchedule: Array<{
        epochNumber: number,
        startDate: Date,
        endDate: Date,
        rewardPool: number
    }> = [];
    const PAST_EPOCHS_TO_SHOW = 12; // Show last 3 months
    const EPOCH_START_DATE = new Date('2024-10-30');

    let customPrice: number | null = null;
    let useCustomPrice = false;

    let maxSliderValue = 1000000; // 1M VOI
    let sliderValue = 0;

    let tooltipVisible = {
        totalStake: false,
        breakEven: false,
        annualReturns: false
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
        calculationAmount = value;
        sliderValue = value;
        calculateRewards();
    }

    function handleInputChange() {
        sliderValue = calculationAmount;
        calculateRewards();
    }

    $: effectivePrice = useCustomPrice && customPrice !== null ? customPrice : $voiPrice.price;

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
                    sliderValue = calculationAmount;
                    calculateRewards();
                }
            } catch (error) {
                console.error('Error updating wallet balance:', error);
                walletBalance = 0;
                calculationAmount = 0;
                sliderValue = 0;
                calculateRewards();
            }
        }
    }

    function setCalculationAmount(multiplier: number) {
        calculationAmount = walletBalance * multiplier;
        calculateRewards();
    }

    function setFixedAmount(amount: number) {
        calculationAmount = amount;
        calculateRewards();
    }

    function resetToWalletBalance() {
        calculationAmount = walletBalance;
        calculateRewards();
    }

    // Initialize data
    onMount(async () => {
        try {
            // Fetch VOI price if not already set
            await fetchVoiPrice();

            const [supplyData, dates] = await Promise.all([
                getSupplyInfo(),
                dataTable.fetchDateRanges()
            ]);
            
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
                const communityStake = Number(supply['online-money']) - Number(epochData?.blacklist_balance_total);
                rewardStake = communityStake + Math.min(epochData?.blacklist_balance_total, communityStake / 3);
                
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
            epochStartDate.setDate(EPOCH_START_DATE.getDate() + ((currentEpochNumber + i) * 7));
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
                return getTokensByEpoch(currentEpochNumber - (maxPastEpochs - i) +1)
            });

            const pastEpochRewards = await Promise.all(pastEpochPromises);

            pastEpochSchedule = Array.from({ length: maxPastEpochs }, (_, i) => {
                const epochNumber = currentEpochNumber - (maxPastEpochs - i);
                const epochStartDate = new Date(EPOCH_START_DATE);
                epochStartDate.setDate(EPOCH_START_DATE.getDate() + (epochNumber * 7));
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

        // Calculate profitability threshold
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
            
            // Ensure we're slightly above the node cost
            const targetRevenue = nodeCost * 1.01; // Target 1% above node cost
            
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
        apy = ((simulatedBalance / calculationBalance) - 1) * 100;

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
            monthlyProfit = monthlyRewardUSD - nodeCost;
            monthlyProfitPercentage = (monthlyProfit / nodeCost) * 100;

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
            yearlyProfit = yearlyRewardUSD - (nodeCost * 12);
            yearlyProfitPercentage = (yearlyProfit / (nodeCost * 12)) * 100;

            // Remove breakeven calculation
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
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric', 
            year: 'numeric',
            timeZone: 'UTC'
        }) + ' UTC';
    }

    function adjustCustomPrice(percentChange: number) {
        if (customPrice !== null) {
            customPrice = Math.max(0, customPrice * (1 + percentChange));
            calculateRewards();
        }
    }
</script>

<div class="space-y-6">
    {#if error}
        <div class="p-4 bg-red-100 text-red-700 rounded-lg">
            {error}
        </div>
    {:else if isLoading}
        <div class="p-4 text-gray-600 dark:text-gray-400">
            Loading calculator data...
        </div>
    {:else}
        <!-- Input Section -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="calculationAmount" class="block text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                            Stake Amount
                        </label>
                        <div class="space-y-4">
                            <div class="flex items-center space-x-4">
                                <div class="flex-1">
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
                                        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium">
                                            VOI
                                        </span>
                                    </div>
                                    {#if calculationAmount > 0 && effectivePrice > 0}
                                        <p class="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                                            Value: {formatUSD(calculationAmount * effectivePrice)}
                                        </p>
                                    {/if}
                                </div>
                            </div>

                            <div class="space-y-2">
                                <input
                                    type="range"
                                    bind:value={sliderValue}
                                    min="0"
                                    max={maxSliderValue}
                                    step="100"
                                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-500"
                                    on:input={handleSliderChange}
                                />
                                <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                    <span>0 VOI</span>
                                    <span>{(maxSliderValue / 2).toLocaleString()} VOI</span>
                                    <span>{maxSliderValue.toLocaleString()} VOI</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Quick Select Buttons -->
                        <div class="mt-6">
                            <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quick Select</p>
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {#if walletBalance > 0}
                                    <button
                                        class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border-2 
                                        {calculationAmount === walletBalance ? 
                                            'border-purple-500 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300' : 
                                            'border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/50 hover:border-purple-300 dark:hover:border-purple-700'} 
                                        transition-all duration-200 group"
                                        on:click={resetToWalletBalance}
                                    >
                                        <div class="flex flex-col items-center">
                                            <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-300">Current Balance</span>
                                            <span>{walletBalance.toLocaleString()} VOI</span>
                                        </div>
                                    </button>
                                    <button
                                        class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border-2 
                                        {calculationAmount === walletBalance * 2 ? 
                                            'border-purple-500 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300' : 
                                            'border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/50 hover:border-purple-300 dark:hover:border-purple-700'} 
                                        transition-all duration-200 group"
                                        on:click={() => setCalculationAmount(2)}
                                    >
                                        <div class="flex flex-col items-center">
                                            <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-300">2x Balance</span>
                                            <span>{(walletBalance * 2).toLocaleString()} VOI</span>
                                        </div>
                                    </button>
                                    {#if childAccounts.length > 0}
                                        <button
                                            class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border-2 
                                            {calculationAmount === Math.round(primaryAccountInfo?.balance + childAccounts.reduce((acc, account) => acc + account.balance, 0) * 1e6) / 1e6 ? 
                                                'border-purple-500 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300' : 
                                                'border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/50 hover:border-purple-300 dark:hover:border-purple-700'} 
                                            transition-all duration-200 group"
                                            on:click={() => setFixedAmount(Math.round(primaryAccountInfo?.balance + childAccounts.reduce((acc, account) => acc + account.balance, 0) * 1e6) / 1e6)}
                                        >
                                            <div class="flex flex-col items-center">
                                                <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-300">All Accounts</span>
                                                <span>{(primaryAccountInfo?.balance + childAccounts.reduce((acc, account) => acc + account.balance, 0)).toLocaleString()} VOI</span>
                                            </div>
                                        </button>
                                    {:else}
                                        <button
                                            class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border-2 
                                            {calculationAmount === walletBalance * 10 ? 
                                                'border-purple-500 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300' : 
                                                'border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/50 hover:border-purple-300 dark:hover:border-purple-700'} 
                                            transition-all duration-200 group"
                                            on:click={() => setCalculationAmount(10)}
                                        >
                                            <div class="flex flex-col items-center">
                                                <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-300">10x Balance</span>
                                                <span>{(walletBalance * 10).toLocaleString()} VOI</span>
                                            </div>
                                        </button>
                                    {/if}
                                {/if}
                                <button
                                    class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border-2 
                                    {calculationAmount === profitabilityThreshold ? 
                                        'border-purple-500 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300' : 
                                        'border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/50 hover:border-purple-300 dark:hover:border-purple-700'} 
                                    transition-all duration-200 group"
                                    on:click={() => setFixedAmount(profitabilityThreshold)}
                                >
                                    <div class="flex flex-col items-center">
                                        <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-300">Break Even</span>
                                        <span>{profitabilityThreshold.toLocaleString()} VOI</span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- VOI Price Card -->
                    <div class="flex justify-center items-center">
                        <div class="flex flex-col items-center p-6 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                            <div class="flex justify-between mb-2 space-x-10">
                                <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Current VOI Price (USD)</h3>
                                <button
                                    class="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                                    on:click={toggleCustomPrice}
                                >
                                    {useCustomPrice ? 'Use Market Price' : 'Custom Price'}
                                </button>
                            </div>
                            {#if useCustomPrice}
                                <div class="space-y-3">
                                    <div class="relative">
                                        <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400">
                                            $
                                        </span>
                                        <input
                                            type="number"
                                            bind:value={customPrice}
                                            min="0"
                                            step="0.00000001"
                                            class="pl-7 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-2xl font-bold text-center"
                                            on:change={() => calculateRewards()}
                                        />
                                    </div>
                                    <div class="grid grid-cols-4 gap-2">
                                        <button
                                            class="px-2 py-1 text-sm font-medium rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            on:click={() => adjustCustomPrice(-0.1)}
                                        >
                                            -10%
                                        </button>
                                        <button
                                            class="px-2 py-1 text-sm font-medium rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            on:click={() => adjustCustomPrice(-0.05)}
                                        >
                                            -5%
                                        </button>
                                        <button
                                            class="px-2 py-1 text-sm font-medium rounded border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                                            on:click={() => adjustCustomPrice(0.05)}
                                        >
                                            +5%
                                        </button>
                                        <button
                                            class="px-2 py-1 text-sm font-medium rounded border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                                            on:click={() => adjustCustomPrice(0.1)}
                                        >
                                            +10%
                                        </button>
                                    </div>
                                </div>
                            {:else}
                                <p class="text-3xl font-bold text-purple-600 dark:text-purple-400 text-center">
                                    {$voiPrice.price > 0 ? formatUSD($voiPrice.price, 8) : 'Loading...'}
                                </p>
                            {/if}
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-2 text-center flex items-center justify-center space-x-2">
                                {#if useCustomPrice}
                                    <span>Custom price for calculations</span>
                                {:else}
                                    <span>Last updated: {$voiPrice.lastUpdated ? $voiPrice.lastUpdated.toLocaleTimeString() : 'Loading...'}</span>
                                    <button
                                        class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors duration-200"
                                        on:click={() => fetchVoiPrice(true)}
                                        aria-label="Refresh price"
                                    >
                                        <svg class="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                {/if}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Results Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- Investment Overview -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h3 class="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100 flex items-center">
                    <svg class="w-6 h-6 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    Investment Overview
                </h3>
                <div class="space-y-6">
                    <div>
                        <div class="flex items-center mb-2">
                            <svg class="w-5 h-5 text-purple-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                            </svg>
                            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Stake</p>
                            <div class="relative inline-block">
                                <button
                                    class="ml-1.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                                    on:mouseenter={() => showTooltip('totalStake')}
                                    on:mouseleave={() => hideTooltip('totalStake')}
                                    aria-label="Total Stake"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                </button>
                                {#if tooltipVisible.totalStake}
                                    <div class="absolute left-0 transform -translate-x-1/2 translate-y-2 z-10 w-72 rounded-lg bg-white dark:bg-gray-700 p-4 shadow-lg border border-gray-200 dark:border-gray-600 text-sm">
                                        <div class="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 rotate-45 bg-white dark:bg-gray-700 border-l border-t border-gray-200 dark:border-gray-600"></div>
                                        <p class="text-gray-600 dark:text-gray-300">
                                            The stake amount used in our calculation to estimate rewards and profitability
                                        </p>
                                    </div>
                                {/if}
                            </div>
                        </div>
                        <p class="text-3xl font-bold text-gray-900 dark:text-gray-100">
                            {totalBalance.toFixed(2)} VOI
                        </p>
                        {#if effectivePrice > 0}
                            <p class="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
                                {formatUSD(totalBalance * effectivePrice)}
                            </p>
                        {/if}
                    </div>

                    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <div class="flex items-center mb-2">
                            <svg class="w-5 h-5 text-purple-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v4m-3-3l3 3m0 0l3-3m-3 3V4"></path>
                            </svg>
                            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Break Even Stake</p>
                            <div class="relative inline-block">
                                <button
                                    class="ml-1.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                                    on:mouseenter={() => showTooltip('breakEven')}
                                    on:mouseleave={() => hideTooltip('breakEven')}
                                    aria-label="Break Even Stake"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                </button>
                                {#if tooltipVisible.breakEven}
                                    <div class="absolute left-0 transform -translate-x-1/2 translate-y-2 z-10 w-72 rounded-lg bg-white dark:bg-gray-700 p-4 shadow-lg border border-gray-200 dark:border-gray-600 text-sm">
                                        <div class="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 rotate-45 bg-white dark:bg-gray-700 border-l border-t border-gray-200 dark:border-gray-600"></div>
                                        <p class="text-gray-600 dark:text-gray-300">
                                            The stake required based on the current estimated block rewards, token price, and node running cost to break even
                                        </p>
                                    </div>
                                {/if}
                            </div>
                        </div>
                        <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {profitabilityThreshold.toLocaleString()} VOI
                        </p>
                        {#if effectivePrice > 0}
                            <p class="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
                                {formatUSD(profitabilityThreshold * effectivePrice)}
                            </p>
                        {/if}
                    </div>

                    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <div class="flex items-center mb-2">
                            <svg class="w-5 h-5 text-purple-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Annual Returns</p>
                            <div class="relative inline-block">
                                <button
                                    class="ml-1.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                                    on:mouseenter={() => showTooltip('annualReturns')}
                                    on:mouseleave={() => hideTooltip('annualReturns')}
                                    aria-label="Annual Returns"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                </button>
                                {#if tooltipVisible.annualReturns}
                                    <div class="absolute left-0 transform -translate-x-1/2 translate-y-2 z-10 w-72 rounded-lg bg-white dark:bg-gray-700 p-4 shadow-lg border border-gray-200 dark:border-gray-600 text-sm">
                                        <div class="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 rotate-45 bg-white dark:bg-gray-700 border-l border-t border-gray-200 dark:border-gray-600"></div>
                                        <p class="text-gray-600 dark:text-gray-300">
                                            The calculated annual percentage rate and yield based on the current online stake and weekly block rewards, assuming these values remain unchanged
                                        </p>
                                    </div>
                                {/if}
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">APR</p>
                                <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                    {apr.toFixed(2)}%
                                </p>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">APY</p>
                                <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                    {apy.toFixed(2)}%
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Rewards Card -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h3 class="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100 flex items-center">
                    <svg class="w-6 h-6 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path>
                    </svg>
                    Estimated Rewards
                </h3>
                <div class="space-y-6">
                    <div>
                        <div class="flex items-center mb-2">
                            <svg class="w-5 h-5 text-purple-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Weekly</p>
                        </div>
                        <div class="flex items-baseline space-x-2">
                            <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {weeklyReward.toFixed(2)} VOI
                            </p>
                            {#if effectivePrice > 0}
                                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">
                                    ({formatUSD(weeklyRewardUSD)})
                                </p>
                            {/if}
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Expected participation: {expectedWeeklyBlocks.toLocaleString(undefined, {maximumFractionDigits: 1})} blocks
                        </p>
                    </div>

                    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <div class="flex items-center mb-2">
                            <svg class="w-5 h-5 text-purple-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                            </svg>
                            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Monthly</p>
                        </div>
                        <div class="flex items-baseline space-x-2">
                            <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {monthlyReward.toFixed(2)} VOI
                            </p>
                            {#if effectivePrice > 0}
                                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">
                                    ({formatUSD(monthlyRewardUSD)})
                                </p>
                            {/if}
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Expected participation: {expectedMonthlyBlocks.toLocaleString(undefined, {maximumFractionDigits: 1})} blocks
                        </p>
                    </div>

                    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <div class="flex items-center mb-2">
                            <svg class="w-5 h-5 text-purple-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"></path>
                            </svg>
                            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Yearly</p>
                        </div>
                        <div class="flex items-baseline space-x-2">
                            <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {yearlyReward.toFixed(2)} VOI
                            </p>
                            {#if effectivePrice > 0}
                                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">
                                    ({formatUSD(yearlyRewardUSD)})
                                </p>
                            {/if}
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Expected participation: {expectedYearlyBlocks.toLocaleString(undefined, {maximumFractionDigits: 1})} blocks
                        </p>
                    </div>
                </div>
            </div>

            <!-- Profitability Analysis -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h3 class="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100 flex items-center">
                    <svg class="w-6 h-6 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                    </svg>
                    Profitability Analysis
                </h3>

                <!-- Node Cost Input -->
                <div class="mb-6">
                    <div class="flex items-center mb-2">
                        <svg class="w-5 h-5 text-purple-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                        </svg>
                        <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Monthly Node Cost</p>
                    </div>
                    <div class="relative">
                        <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400">
                            $
                        </span>
                        <input
                            type="number"
                            id="nodeCost"
                            bind:value={nodeCost}
                            min="0"
                            step="1"
                            class="pl-7 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            on:change={() => calculateRewards()}
                        />
                    </div>
                </div>

                <!-- Monthly Profit -->
                <div class="p-4 rounded-lg mb-4 {monthlyProfit >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center">
                            <svg class="w-5 h-5 {monthlyProfit >= 0 ? 'text-green-500' : 'text-red-500'} mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                            </svg>
                            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Monthly Profit</p>
                        </div>
                        <p class="text-2xl font-bold {monthlyProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                            {formatUSD(monthlyProfit)}
                        </p>
                    </div>
                    <div class="flex justify-between text-sm">
                        <p class="text-gray-500 dark:text-gray-400">Revenue</p>
                        <p class="font-medium text-gray-700 dark:text-gray-300">{formatUSD(monthlyRewardUSD)}</p>
                    </div>
                    <div class="flex justify-between text-sm">
                        <p class="text-gray-500 dark:text-gray-400">Cost</p>
                        <p class="font-medium text-gray-700 dark:text-gray-300">{formatUSD(nodeCost)}</p>
                    </div>
                    <div class="mt-2 text-xs text-right">
                        <span class="{monthlyProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                            ROI: {monthlyProfitPercentage.toFixed(2)}%
                        </span>
                    </div>
                </div>

                <!-- Yearly Profit -->
                <div class="p-4 rounded-lg {yearlyProfit >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center">
                            <svg class="w-5 h-5 {yearlyProfit >= 0 ? 'text-green-500' : 'text-red-500'} mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                            </svg>
                            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Yearly Profit</p>
                        </div>
                        <p class="text-2xl font-bold {yearlyProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                            {formatUSD(yearlyProfit)}
                        </p>
                    </div>
                    <div class="flex justify-between text-sm">
                        <p class="text-gray-500 dark:text-gray-400">Revenue</p>
                        <p class="font-medium text-gray-700 dark:text-gray-300">{formatUSD(yearlyRewardUSD)}</p>
                    </div>
                    <div class="flex justify-between text-sm">
                        <p class="text-gray-500 dark:text-gray-400">Cost</p>
                        <p class="font-medium text-gray-700 dark:text-gray-300">{formatUSD(nodeCost * 12)}</p>
                    </div>
                    <div class="mt-2 text-xs text-right">
                        <span class="{yearlyProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                            ROI: {yearlyProfitPercentage.toFixed(2)}%
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Reward Schedule -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            <button
                class="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700"
                on:click={() => isRewardScheduleVisible = !isRewardScheduleVisible}
            >
                <span class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    View Reward Schedule
                </span>
                <svg
                    class="w-5 h-5 transform transition-transform duration-200 {isRewardScheduleVisible ? 'rotate-180' : ''}"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {#if isRewardScheduleVisible}
                <div class="overflow-x-auto">
                    {#if PAST_EPOCHS_TO_SHOW > 0}
                        <button
                            class="w-full px-6 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700"
                            on:click={() => isPastEpochsVisible = !isPastEpochsVisible}
                        >
                            {isPastEpochsVisible ? 'Hide' : 'Show'} Previous Epochs
                        </button>
                    {/if}

                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Epoch
                                </th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Date Range
                                </th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Reward Pool
                                </th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {#if isPastEpochsVisible}
                                {#each pastEpochSchedule as epoch}
                                    <tr class="text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <td class="px-6 py-4 whitespace-nowrap text-sm">
                                            {epoch.epochNumber+1}
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
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 {epoch.isCurrent ? 'bg-purple-50 dark:bg-purple-900/20' : ''}">
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium {epoch.isCurrent ? 'text-purple-600 dark:text-purple-400' : 'text-gray-900 dark:text-gray-100'}">
                                        {epoch.epochNumber+1}
                                        {#if epoch.isCurrent}
                                            <span class="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
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
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm text-gray-600 dark:text-gray-400">
            <p>* Calculations assume current network conditions and weekly compounding of rewards.</p>
            <p>* Actual rewards and rates may vary based on network participation and other factors.</p>
            <p>* This tool is for entertainment purposes only. It is not financial advice.</p>
        </div>
    {/if}
</div>
