<script lang="ts">
    import { Badge, Card, Spinner } from 'flowbite-svelte';
    import { config } from '../config';
	import InfoButton from './ui/InfoButton.svelte';
    import { getAccountInfo, getSupplyInfo, getConsensusInfo } from '$lib/stores/accounts';
    import { onMount } from 'svelte';
    import { getTokensByEpoch } from '$lib/utils';

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

    $: if (walletId) {
        fetchNodeData();
    }

    $: loading = false;

    onMount(async () => {
        supply = await getSupplyInfo();
        
        // epoch number = number of weeks since 2024-10-30
        const epoch = Math.floor((Date.now() - new Date('2024-10-30T00:00:00Z').getTime()) / (7 * 24 * 60 * 60 * 1000))+1;
        const tokensReward = await getTokensByEpoch(epoch);

        //const numBlocks = apiData.last_block - apiData.first_block;

        //voiPerBlock = tokensReward / 1e6;
    });

    async function fetchNodeData() {
        loading = true;
        try {
            // Get account information
            accountInfo = await getAccountInfo(walletId);

            balance = Number(accountInfo?.amount??0);
            apiData = await getConsensusInfo(walletId);
            
            const epochBlocks = apiData.last_block - apiData.first_block;
            estimatedBlocks = Math.round(balance / Number(supply?.['online-money']??0) * epochBlocks);

            averageBlockTime = calculateAverageBlockTime();
            expectedBlocksPerDay = calculateExpectedBlocks(1);
            expectedBlocksPerWeek = calculateExpectedBlocks(7);
            expectedBlocksPerMonth = calculateExpectedBlocks(30);

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
        const epochBlocks = apiData.last_block - apiData.first_block;
        const epochSeconds = epochBlocks * 2.8; // Assuming 2.8 seconds per block
        return epochSeconds / estimatedBlocks;
    }

    function calculateExpectedBlocks(days: number) {
        const secondsPerDay = 24 * 60 * 60;
        const blocksPerDay = secondsPerDay / 2.8; // Assuming 2.8 seconds per block
        return (balance / Number(supply?.['online-money']??0)) * blocksPerDay * days;
    }
</script>

<div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl">
        <div class="p-6">
            <h3 class="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                <span class="flex items-center justify-between">
                    <div>Anticipated Proposals</div>
                    <InfoButton noAbsolute>
                        <p>This is the calculated average block proposals for the selected account based on account balance and the total online stake.</p>
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
                            <span class="font-medium text-gray-600 dark:text-gray-400">Avg Blocks per day:</span>
                            <span class="text-gray-800 dark:text-gray-200">{expectedBlocksPerDay.toFixed(2)}
                                <span class="text-gray-600 dark:text-gray-400 hidden">({(voiPerBlock * expectedBlocksPerDay).toFixed(2)} VOI)</span>
                            </span>
                        </p>
                        <p class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Avg Blocks per week:</span>
                            <span class="text-gray-800 dark:text-gray-200">{expectedBlocksPerWeek.toFixed(2)}</span>
                        </p>
                        <p class="flex justify-between items-center py-2">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Avg Blocks per month:</span>
                            <span class="text-gray-800 dark:text-gray-200">{expectedBlocksPerMonth.toFixed(2)}</span>
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

