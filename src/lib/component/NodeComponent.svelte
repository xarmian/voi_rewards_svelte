<script lang="ts">
    import { Badge, Card, Spinner } from 'flowbite-svelte';
    import { config } from '../config';
	import InfoButton from './ui/InfoButton.svelte';
    import { getAccountInfo, getSupplyInfo, getConsensusInfo } from '$lib/stores/accounts';
    import { onMount } from 'svelte';
    import { extrapolateRewardPerBlock, getTokensByEpoch } from '$lib/utils';
    import { dataTable } from '../../stores/dataTable';

    export let walletId: string;

    let accountInfo: any;
    let supply: any;
    $: estimatedBlocks = 0;
    $: balance = 0;
    $: apiData = {} as any;

    $: averageBlockTime = 0;
    $: expectedBlocksPerDay = 0;
    $: expectedBlocksPerWeek = 0;
    $: expectedBlocksPerMonth = 0;
    $: voiPerBlock = 0;
    $: estimatedRewardsPerDay = 0;
    $: estimatedRewardsPerWeek = 0;
    $: estimatedRewardsPerMonth = 0;

    $: if (walletId) {
        fetchNodeData();
    }

    $: loading = false;

    onMount(async () => {
    });

    async function fetchNodeData() {
        loading = true;
        try {
            supply = await getSupplyInfo();
            
            // Get latest epoch data
            const dates = await dataTable.fetchDateRanges();
            const latestEpoch = dates[dates.length - 1];
            const epochData = await dataTable.fetchData(latestEpoch.id);
            
            if (epochData) {
                const tokens = await getTokensByEpoch(latestEpoch.epoch);
                const rewardedBlocks = epochData.num_blocks + Math.min(epochData.num_blocks / 3, epochData.num_blocks_ballast);
                const rewardData = extrapolateRewardPerBlock(rewardedBlocks, tokens);

                voiPerBlock = rewardData.projectedRewardPerBlock;
            }

            // Get account information
            accountInfo = await getAccountInfo(walletId);

            balance = Number(accountInfo?.amount??0);
            apiData = await getConsensusInfo(walletId);
            
            averageBlockTime = calculateAverageBlockTime();
            expectedBlocksPerDay = calculateExpectedBlocks(1);
            expectedBlocksPerWeek = calculateExpectedBlocks(7);
            expectedBlocksPerMonth = calculateExpectedBlocks(30);

            // Calculate estimated rewards
            estimatedRewardsPerDay = expectedBlocksPerDay * voiPerBlock;
            estimatedRewardsPerWeek = expectedBlocksPerWeek * voiPerBlock;
            estimatedRewardsPerMonth = expectedBlocksPerMonth * voiPerBlock;

            loading = false;
        } catch (error) {
            console.error('Failed to fetch node data:', error);
        } finally {
            loading = false;
        }
    }

    function formatTime(seconds: number) {
        const days = seconds / (24 * 60 * 60);
        if (days > 3) {
            return `${days.toFixed(1)} days`;
        } else {
            const hours = Math.floor(seconds / (60 * 60));
            seconds %= 60 * 60;
            const minutes = Math.floor(seconds / 60);
            return `${hours} hours, ${minutes} minutes`;
        }
    }

    function dateFromSeconds(seconds: number) {
        const date = new Date();
        date.setSeconds(date.getSeconds() + seconds);
        return date.toLocaleString();
    }

    function calculateAverageBlockTime() {
        // Calculate user's stake percentage of total online stake
        const userStakePercentage = balance / Number(supply?.['online-money']??0);
        
        // Network produces a block every 2.8 seconds
        const secondsPerBlock = 2.8;
        
        // User will propose blocks proportional to their stake percentage
        // So they'll propose a block every (secondsPerBlock / userStakePercentage) seconds
        return secondsPerBlock / userStakePercentage;
    }

    function calculateExpectedBlocks(days: number) {
        const secondsPerDay = 24 * 60 * 60;
        const blocksPerDay = secondsPerDay / 2.8; // Assuming 2.8 seconds per block
        return (balance / Number(supply?.['online-money']??0)) * blocksPerDay * days;
    }
</script>

<div class='grid grid-cols-1 md:grid-cols-2 gap-6 w-full'>
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl">
        <div class="p-6">
            <h3 class="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                <span class="flex items-center justify-between">
                    <div>Anticipated Proposals</div>
                    <InfoButton noAbsolute>
                        <p>This is the calculated average block proposals and rewards for the selected account based on account balance and the total online stake.</p>
                    </InfoButton>
                </span>
            </h3>
            {#if loading}
                <div class="flex justify-center items-center h-24">
                    <Spinner size="16" />
                </div>
            {:else if balance == 0 || Number(supply?.['online-money']??0) == 0}
                <div class="flex justify-center items-center h-24">
                    <span class="text-gray-600 dark:text-gray-400">No data available</span>
                </div>
            {:else}
                <div class="space-y-3">
                    {#if typeof apiData.total_blocks == 'undefined' || !supply || !apiData.first_block}
                        <div class="flex justify-center items-center h-24">
                            <Spinner size="16" />
                        </div>
                    {:else}
                        <p class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Avg Block every:</span>
                            <span class="text-gray-800 dark:text-gray-200">{formatTime(averageBlockTime)}</span>
                        </p>
                        <p class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                            <span class="font-medium text-gray-600 dark:text-gray-400 self-start">Avg Blocks per day:</span>
                            <span class="text-gray-800 dark:text-gray-200 flex flex-col items-end">
                                {expectedBlocksPerDay.toLocaleString()}
                                <span class="text-gray-600 dark:text-gray-400 ml-2">
                                    ~{estimatedRewardsPerDay.toLocaleString()} VOI
                                </span>
                            </span>
                        </p>
                        <p class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                            <span class="font-medium text-gray-600 dark:text-gray-400 self-start">Avg Blocks per week:</span>
                            <span class="text-gray-800 dark:text-gray-200 flex flex-col items-end">
                                {expectedBlocksPerWeek.toLocaleString()}
                                <span class="text-gray-600 dark:text-gray-400 ml-2">
                                    ~{estimatedRewardsPerWeek.toLocaleString()} VOI
                                </span>
                            </span>
                        </p>
                        <p class="flex justify-between items-center py-2">
                            <span class="font-medium text-gray-600 dark:text-gray-400 self-start">Avg Blocks per month:</span>
                            <span class="text-gray-800 dark:text-gray-200 flex flex-col items-end">
                                {expectedBlocksPerMonth.toLocaleString()}
                                <span class="text-gray-600 dark:text-gray-400 ml-2">
                                    ~{estimatedRewardsPerMonth.toLocaleString()} VOI
                                </span>
                            </span>
                        </p>
                        <p class="justify-between items-center py-2 border-t border-gray-200 dark:border-gray-700 hidden">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Approx APR:</span>
                            <span class="text-gray-800 dark:text-gray-200">{((voiPerBlock * expectedBlocksPerWeek * 52 / balance * 1e6) * 100).toFixed(2)}%</span>
                        </p>
                    {/if}
                </div>
            {/if}
        </div>
    </div>

    {#if accountInfo && accountInfo.status=='Online'}
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl">
            <div class="p-6">
                <h3 class="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Consensus</h3>
                <div class="space-y-3">
                    {#if loading}
                        <div class="flex justify-center items-center h-32">
                            <Spinner size="16" />
                        </div>
                    {:else}
                        <p class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Vote Key Expires:</span>
                            <span class="text-gray-800 dark:text-gray-200">{formatTime((accountInfo['participation']['vote-last-valid'] - accountInfo['round'])*3.3)}</span>
                        </p>
                        <p class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Expiry Date (approx):</span>
                            <span class="text-gray-800 dark:text-gray-200">{dateFromSeconds((accountInfo['participation']['vote-last-valid'] - accountInfo['round'])*3.3)}</span>
                        </p>
                        <p class="flex justify-between items-center py-2 border-b-2 border-gray-400 dark:border-gray-800">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Expiry Block:</span>
                            <span class="text-gray-800 dark:text-gray-200">{accountInfo['participation']['vote-last-valid'].toLocaleString()}</span>
                        </p>
                        <p class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Hard Votes:</span>
                            <span class="text-gray-800 dark:text-gray-200">{apiData && apiData.vote_count ? apiData.vote_count : 'Loading...'}</span>
                        </p>
                        <p class="flex justify-between items-center py-2">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Last Hard Vote:</span>
                            <span class="text-gray-800 dark:text-gray-200">
                                {#if apiData && apiData.last_vote_timestamp}
                                    {new Date(apiData.last_vote_timestamp).toLocaleString()}
                                {:else}
                                    Loading...
                                {/if}
                            </span>
                        </p>
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
</style>

