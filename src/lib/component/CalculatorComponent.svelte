<script lang="ts">
    import { getSupplyInfo } from '$lib/stores/accounts';
    import { dataTable } from '../../stores/dataTable';
    import { extrapolateRewardPerBlock, getTokensByEpoch } from '$lib/utils';
    import { onMount } from 'svelte';
    import { getAccountInfo } from '$lib/stores/accounts';

    export let walletAddress: string;
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
        rewardPool: number
    }> = [];

    async function updateWalletBalance() {
        if (walletAddress) {
            initialBalance = Number((await getAccountInfo(walletAddress))?.amount) / 1e6 || 0;
            calculateRewards();
        }
    }

    // Initialize data
    onMount(async () => {
        try {
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

            const [epochData, tokens] = await Promise.all([
                dataTable.fetchData(latestEpoch.id),
                getTokensByEpoch(latestEpoch.epoch)
            ]);

            if (epochData) {
                // get community stake
                const communityStake = Number(supply['online-money']) - Number(epochData?.blacklist_balance_total);
                rewardStake = communityStake + Math.min(epochData?.blacklist_balance_total, communityStake / 3);
            }

            // Calculate epoch schedule
            const EPOCH_DURATION_DAYS = 7;
            const EPOCH_START = new Date('2023-10-30');
            epochSchedule = Array.from({ length: EPOCHS_PER_YEAR }, (_, i) => {
                const epochStartDate = new Date(EPOCH_START);
                epochStartDate.setDate(EPOCH_START.getDate() + (i * EPOCH_DURATION_DAYS));
                const epochEndDate = new Date(epochStartDate);
                epochEndDate.setDate(epochStartDate.getDate() + EPOCH_DURATION_DAYS - 1);
                
                return {
                    epochNumber: i + 1, // Start from epoch 1
                    startDate: epochStartDate,
                    endDate: epochEndDate,
                    rewardPool: epochRewards[i] || 0
                };
            });

            await updateWalletBalance();
            isLoading = false;
        } catch (err) {
            error = 'Error loading data. Please try again later.';
            isLoading = false;
        }
    });

    function calculateRewards() {
        totalBalance = initialBalance + additionalAmount;
        
        if (!supply?.['online-money'] || totalBalance <= 0) {
            weeklyReward = 0;
            monthlyReward = 0;
            yearlyReward = 0;
            apr = 0;
            apy = 0;
            balanceAfterWeek = 0;
            balanceAfterMonth = 0;
            balanceAfterYear = 0;
            return;
        }

        const onlineMoney = Number(supply['online-money']);
        let shareOfStake = totalBalance / (rewardStake / 1e6);
        let shareOfTotalStake = totalBalance / (onlineMoney / 1e6);

        // Calculate expected blocks based on stake share
        expectedWeeklyBlocks = weeklyBlocks * shareOfTotalStake;
        expectedMonthlyBlocks = monthlyBlocks * shareOfTotalStake;
        expectedYearlyBlocks = yearlyBlocks * shareOfTotalStake;

        // Calculate rewards considering changing epoch rewards
        let accumulatedReward = 0;
        let currentBalance = totalBalance;

        // Weekly reward (using current epoch)
        weeklyReward = shareOfStake * epochRewards[0];

        // Monthly reward (approximately 4.33 weeks)
        const monthlyEpochs = 30.44 / 7;
        monthlyReward = 0;
        for (let i = 0; i < monthlyEpochs && i < epochRewards.length; i++) {
            const epochReward = calculateEpochReward(shareOfStake, epochRewards[i]);
            monthlyReward += epochReward;
        }

        // Yearly reward with compound interest
        yearlyReward = 0;
        for (let i = 0; i < EPOCHS_PER_YEAR && i < epochRewards.length; i++) {
            const epochReward = calculateEpochReward(shareOfStake, epochRewards[i]);
            yearlyReward += epochReward;

            // Update share of stake for compound interest
            currentBalance += epochReward;
            shareOfStake = currentBalance / (rewardStake / 1e6);
        }

        // Calculate APR using actual yearly reward
        apr = (weeklyReward / totalBalance) * 52 * 100;

        // Calculate APY considering changing epoch rewards
        apy = ((currentBalance / totalBalance) - 1) * 100;

        // Calculate future balances
        balanceAfterWeek = totalBalance + weeklyReward;
        balanceAfterMonth = totalBalance + monthlyReward;
        balanceAfterYear = currentBalance;
    }

    // Helper function to calculate rewards for a specific epoch
    function calculateEpochReward(shareOfStake: number, epochRewardPool: number): number {
        return shareOfStake * epochRewardPool;
    }

    // Add wallet address reactivity
    $: {
        if (!isLoading && walletAddress) {
            updateWalletBalance();
        }
    }

    $: {
        calculateRewards();
    }

    function formatDate(date: Date): string {
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
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
                <div>
                    <label for="initialBalance" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Initial Balance (VOI)
                    </label>
                    <input
                        type="number"
                        id="initialBalance"
                        bind:value={initialBalance}
                        min="0"
                        step="1"
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        on:change={() => calculateRewards()}
                    />
                </div>
                <div>
                    <label for="additionalAmount" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Additional Amount (VOI)
                    </label>
                    <div class="mt-1 space-y-2">
                        <div class="text-lg font-semibold text-purple-600 dark:text-purple-400">
                            {additionalAmount.toLocaleString()} VOI
                        </div>
                        <div class="flex items-center gap-4">
                            <input
                                type="range"
                                id="additionalAmount"
                                bind:value={additionalAmount}
                                min="0"
                                max={maxAdditionalAmount}
                                step={stepSize}
                                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-600"
                                on:change={() => calculateRewards()}
                            />
                            <input
                                type="number"
                                bind:value={additionalAmount}
                                min="0"
                                max={maxAdditionalAmount}
                                step={stepSize}
                                class="w-32 rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                on:change={() => calculateRewards()}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Results Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <div class="mb-6">
                    <div class="space-y-3">
                        <div>
                            <p class="text-sm text-gray-500 dark:text-gray-400">Starting Balance</p>
                            <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {totalBalance.toFixed(2)} VOI
                            </p>
                        </div>
                    </div>
                </div>
                <div>
                    <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Rates</h3>
                    <div class="space-y-3">
                        <div>
                            <p class="text-sm text-gray-500 dark:text-gray-400">APR</p>
                            <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {apr.toFixed(2)}%
                            </p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500 dark:text-gray-400">APY (Weekly Compound)</p>
                            <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {apy.toFixed(2)}%
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Rewards Card -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Estimated Rewards</h3>
                <div class="space-y-3">
                    <div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Weekly</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {weeklyReward.toFixed(2)} VOI
                        </p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                            Expected participation: {expectedWeeklyBlocks.toLocaleString(undefined, {maximumFractionDigits: 1})} blocks
                        </p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Monthly</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {monthlyReward.toFixed(2)} VOI
                        </p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                            Expected participation: {expectedMonthlyBlocks.toLocaleString(undefined, {maximumFractionDigits: 1})} blocks
                        </p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Yearly</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {yearlyReward.toFixed(2)} VOI
                        </p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                            Expected participation: {expectedYearlyBlocks.toLocaleString(undefined, {maximumFractionDigits: 1})} blocks
                        </p>
                    </div>
                </div>
            </div>

            <!-- Future Balances Card -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Future Balances</h3>
                <div class="space-y-3">
                    <div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">After 1 Week</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {balanceAfterWeek.toFixed(2)} VOI
                        </p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">After 1 Month</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {balanceAfterMonth.toFixed(2)} VOI
                        </p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">After 1 Year</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {balanceAfterYear.toFixed(2)} VOI
                        </p>
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
                            {#each epochSchedule as epoch}
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                        {epoch.epochNumber}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                        {epoch.startDate.toISOString().split('T')[0]} - {epoch.endDate.toISOString().split('T')[0]}
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
            <p>* Actual rewards may vary based on network participation and other factors.</p>
        </div>
    {/if}
</div>
