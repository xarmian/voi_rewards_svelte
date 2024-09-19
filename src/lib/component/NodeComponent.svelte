<script lang="ts">
    import { onMount } from 'svelte';
    import { Badge, Card, Spinner } from 'flowbite-svelte';
    import { algodClient } from '$lib/utils/algod';

    export let walletId: string;
    let accountInfo: any;
    let supply: any;
    $: estimatedBlocks = 0;
    $: balance = 0;
    let apiData: any;
    $: apiData = {};
    $: nodeData = (apiData.data) ? apiData.data[0] : {};

    $: {
        balance = Number(accountInfo?.amount??0);
    }

    $: if (supply && apiData.first_block && balance > 0) {
        // calculate expected block proposals in current epoch
        const epochBlocks = apiData.last_block - apiData.first_block;
        estimatedBlocks = Math.round(balance / supply['online-money'] * epochBlocks);
    }
    
    onMount(async () => {
        try {
            // Get account information
            accountInfo = await algodClient.accountInformation(walletId).do();
        } catch (error) {
            console.error('Failed to fetch account balance:', error);
        }

        supply = await algodClient.supply().do();

        // get node information
        const url = `https://api.voirewards.com/proposers/index_p2.php?action=walletDetails&wallet=${walletId}`;
        await fetch(url, { cache: 'no-store' })
            .then((response) => response.json())
            .then((data) => {
                apiData = data;
            })
            .catch((error) => {
                console.error(error);
            });
    });

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

<div class='grid grid-cols-1 md:grid-cols-2 gap-4'>
    <Card padding="lg" class="bg-white dark:bg-gray-800 shadow-md rounded-lg">
        <h3 class="text-xl font-bold mb-4 text-center">Current Epoch</h3>
        <div class="space-y-2">
            {#if typeof apiData.total_blocks == 'undefined'}
                <div class="flex justify-center items-center h-24">
                    <Spinner size="16" />
                </div>
            {:else}
                <p class="flex justify-between">
                    <span class="font-semibold">Est. Proposals:</span>
                    <span>{estimatedBlocks}</span>
                </p>
                <p class="flex justify-between">
                    <span class="font-semibold">Actual Proposals:</span>
                    <span>{apiData.total_blocks}</span>
                </p>
                <p class="flex justify-between">
                    <span class="font-semibold">Diff:</span>
                    <span>
                        {(estimatedBlocks - apiData.total_blocks)*-1} 
                        ({estimatedBlocks > 0 ?
                            (estimatedBlocks < apiData.total_blocks ? '+' : '-') +
                            Math.abs(Math.round((estimatedBlocks - apiData.total_blocks) / estimatedBlocks * 10000)/100) : '0'}%)
                    </span>
                </p>
            {/if}
        </div>
    </Card>

    {#if accountInfo && accountInfo.status=='Online'}
        <Card padding="lg" class="bg-white dark:bg-gray-800 shadow-md rounded-lg">
            <h3 class="text-xl font-bold mb-4 text-center">Consensus</h3>
            <div class="space-y-2">
                {#if !accountInfo}
                    <div class="flex justify-center items-center h-32">
                        <Spinner size="xl" />
                    </div>
                {:else}
                    <p class="flex justify-between">
                        <span class="font-semibold">Vote Key Expires:</span>
                        <span>{formatTime((accountInfo['participation']['vote-last-valid'] - accountInfo['round'])*3.3)}</span>
                    </p>
                    <p class="flex justify-between">
                        <span class="font-semibold">Expiry Date:</span>
                        <span>{dateFromSeconds((accountInfo['participation']['vote-last-valid'] - accountInfo['round'])*3.3)}</span>
                    </p>
                    <p class="flex justify-between">
                        <span class="font-semibold">Expiry Block:</span>
                        <span>{accountInfo['participation']['vote-last-valid'].toLocaleString()}</span>
                    </p>
                {/if}
            </div>
        </Card>
    {/if}
</div>

<style>
    /* Remove existing styles */
</style>

