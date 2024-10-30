<script lang="ts">
    import { onMount } from 'svelte';
    import { Badge, Card, Spinner } from 'flowbite-svelte';
    import { algodClient } from '$lib/utils/algod';
    import { config } from '../config';
	import InfoButton from './ui/InfoButton.svelte';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    export let walletId: string;

    let accountInfo: any;
    let supply: any;
    $: estimatedBlocks = 0;
    $: balance = 0;
    let apiData: any;
    $: apiData = {};

    $: {
        balance = Number(accountInfo?.amount??0);
    }

    $: if (supply && apiData.first_block && balance > 0) {
        // calculate expected block proposals in current epoch
        const epochBlocks = apiData.last_block - apiData.first_block;
        estimatedBlocks = Math.round(balance / supply['online-money'] * epochBlocks);
    }
    
    onMount(async () => {

    });

    $: if (walletId) {
        console.log('walletId',walletId);
        fetchNodeData();
    }

    async function fetchNodeData() {
        startLoading();
        try {
            // Get account information
            accountInfo = await algodClient.accountInformation(walletId).do();
            supply = await algodClient.supply().do();

            // get node information
            const url = `${config.proposalApiBaseUrl}?action=walletDetails&wallet=${walletId}`;
            await fetch(url, { cache: 'no-store' })
                .then((response) => response.json())
                .then((data) => {
                    apiData = data;
                })
                .catch((error) => {
                    console.error(error);
                });
        } catch (error) {
            console.error('Failed to fetch node data:', error);
        } finally {
            stopLoading();
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
        return (balance / supply['online-money']) * blocksPerDay * days;
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
            {#if typeof apiData.total_blocks == 'undefined' || !supply || !apiData.first_block}
                <div class="flex justify-center items-center h-24">
                    <Spinner size="16" />
                </div>
            {:else if balance == 0 || supply['online-money'] == 0}
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
                            <span class="text-gray-800 dark:text-gray-200">{formatTime(calculateAverageBlockTime())}</span>
                        </p>
                        <p class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Avg Blocks per day:</span>
                            <span class="text-gray-800 dark:text-gray-200">{calculateExpectedBlocks(1).toFixed(2)}</span>
                        </p>
                        <p class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Avg Blocks per week:</span>
                            <span class="text-gray-800 dark:text-gray-200">{calculateExpectedBlocks(7).toFixed(2)}</span>
                        </p>
                        <p class="flex justify-between items-center py-2">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Avg Blocks per month:</span>
                            <span class="text-gray-800 dark:text-gray-200">{calculateExpectedBlocks(30).toFixed(2)}</span>
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
                    {#if !accountInfo}
                        <div class="flex justify-center items-center h-32">
                            <Spinner size="xl" />
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

