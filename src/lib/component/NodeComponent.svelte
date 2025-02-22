<script lang="ts">
    import { Badge, Card, Spinner } from 'flowbite-svelte';
    import { config } from '../config';
	import InfoButton from './ui/InfoButton.svelte';
    import { getAccountInfo, getSupplyInfo, getConsensusInfo } from '$lib/stores/accounts';
    import { onMount } from 'svelte';
    import { extrapolateRewardPerBlock, getTokensByEpoch } from '$lib/utils';
    import { dataTable } from '../../stores/dataTable';
    import RegisterVoteKey from './RegisterVoteKey.svelte';
    import { selectedWallet } from 'avm-wallet-svelte';
    
    export let walletId: string;
    export let parentWalletId: string | null;
    export let contractId: number | null;

    let accountInfo: any;
    let supply: any;
    let showRegisterVoteKey = false;
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

    let rewardStake = 0;
    let currentEpoch: number;
    let epochRewards: number[] = [];
    const EPOCHS_PER_YEAR = 52;

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
            currentEpoch = latestEpoch.epoch;
            const epochData = await dataTable.fetchData(latestEpoch.id);

            // Fetch next year's worth of epoch rewards
            const epochPromises = Array.from({ length: EPOCHS_PER_YEAR }, (_, i) => 
                getTokensByEpoch(currentEpoch + i)
            );
            epochRewards = await Promise.all(epochPromises);
            
            if (epochData) {
                // Calculate community stake
                const communityStake = Number(supply['online-money']) - Number(epochData?.blacklist_balance_total);
                rewardStake = communityStake + Math.min(epochData?.blacklist_balance_total, communityStake / 3);
            }

            // Get account information
            accountInfo = await getAccountInfo(walletId);
            balance = Number(accountInfo?.amount ?? 0);
            apiData = await getConsensusInfo(walletId);
            
            averageBlockTime = calculateAverageBlockTime();
            expectedBlocksPerDay = calculateExpectedBlocks(1);
            expectedBlocksPerWeek = calculateExpectedBlocks(7);
            expectedBlocksPerMonth = calculateExpectedBlocks(30);

            // Calculate estimated rewards using epoch rewards
            estimatedRewardsPerDay = calculateRewardsForPeriod(1/7); // 1/7 of a week
            estimatedRewardsPerWeek = calculateRewardsForPeriod(1);
            estimatedRewardsPerMonth = calculateRewardsForPeriod(30.44/7); // ~4.33 weeks

            loading = false;
        } catch (error) {
            console.error('Failed to fetch node data:', error);
        } finally {
            loading = false;
        }
    }

    function calculateRewardsForPeriod(epochCount: number): number {
        if (!supply?.['online-money'] || balance <= 0 || !rewardStake) return 0;

        const shareOfStake = balance / (rewardStake / 1e6);
        let totalReward = 0;

        // Handle the full epochs
        const fullEpochs = Math.floor(epochCount);
        for (let i = 0; i < fullEpochs && i < epochRewards.length; i++) {
            totalReward += shareOfStake * epochRewards[i];
        }

        // Handle the partial epoch if there is one
        const partialEpoch = epochCount - fullEpochs;
        if (partialEpoch > 0 && fullEpochs < epochRewards.length) {
            totalReward += shareOfStake * epochRewards[fullEpochs] * partialEpoch;
        }

        return totalReward / 1e6;
    }

    function calculateExpectedBlocks(days: number) {
        if (!supply?.['online-money'] || balance <= 0) return 0;
        const secondsPerDay = 24 * 60 * 60;
        const blocksPerDay = secondsPerDay / 2.8; // Assuming 2.8 seconds per block
        return (balance / Number(supply['online-money'])) * blocksPerDay * days;
    }

    function calculateAverageBlockTime() {
        if (!supply?.['online-money'] || balance <= 0) return 0;
        const userStakePercentage = balance / Number(supply['online-money']);
        const secondsPerBlock = 2.8;
        return secondsPerBlock / userStakePercentage;
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
</script>

<div class="flex items-center justify-between">
    <h2 class="text-xl md:text-2xl font-bold mb-4">Consensus</h2>
    {#if $selectedWallet?.app !== 'Watch' && $selectedWallet?.app !== '' && ($selectedWallet?.address === walletId || $selectedWallet?.address === parentWalletId)}
        <button
            on:click={() => showRegisterVoteKey = true}
        class="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1"
    >
        <i class="fas fa-key text-xs"></i>
            <span>{accountInfo?.status === 'Online' ? 'Update' : 'Register'} Participation Key</span>
        </button>
    {/if}
</div>
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
                    {#if typeof apiData?.total_blocks == 'undefined' || !supply || !apiData?.first_block}
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
                                {expectedBlocksPerDay.toLocaleString(undefined, {maximumFractionDigits: 1})}
                                <span class="text-gray-600 dark:text-gray-400 ml-2">
                                    ~{estimatedRewardsPerDay.toLocaleString(undefined, {maximumFractionDigits: 2})} VOI
                                </span>
                            </span>
                        </p>
                        <p class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                            <span class="font-medium text-gray-600 dark:text-gray-400 self-start">Avg Blocks per week:</span>
                            <span class="text-gray-800 dark:text-gray-200 flex flex-col items-end">
                                {expectedBlocksPerWeek.toLocaleString(undefined, {maximumFractionDigits: 1})}
                                <span class="text-gray-600 dark:text-gray-400 ml-2">
                                    ~{estimatedRewardsPerWeek.toLocaleString(undefined, {maximumFractionDigits: 2})} VOI
                                </span>
                            </span>
                        </p>
                        <p class="flex justify-between items-center py-2">
                            <span class="font-medium text-gray-600 dark:text-gray-400 self-start">Avg Blocks per month:</span>
                            <span class="text-gray-800 dark:text-gray-200 flex flex-col items-end">
                                {expectedBlocksPerMonth.toLocaleString(undefined, {maximumFractionDigits: 1})}
                                <span class="text-gray-600 dark:text-gray-400 ml-2">
                                    ~{estimatedRewardsPerMonth.toLocaleString(undefined, {maximumFractionDigits: 2})} VOI
                                </span>
                            </span>
                        </p>
                        <p class="justify-between items-center py-2 border-t border-gray-200 dark:border-gray-700">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Approx APR:</span>
                            <span class="text-gray-800 dark:text-gray-200">{(estimatedRewardsPerWeek / balance * 1e6 * 52 * 100).toFixed(2)}%</span>
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
{#if showRegisterVoteKey}
    <RegisterVoteKey 
        walletAddress={walletId} 
        parentWalletAddress={parentWalletId}
        contractId={contractId}
        bind:showModal={showRegisterVoteKey} 
    />
{/if}
<style>
</style>

