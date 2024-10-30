<script lang="ts">
    /*
    the goal of this component is to calculate the anticipated rewards for a given wallet
    start by finding number of blocks produced by block authority ballast nodes
    award max 25% of blocks to block authority nodes
    
    i.e. block authority produces 100 blocks out of 200 total blocks
    - block authority is limited to 25% of total rewards
    - 75% of rewards go to other accounts
    - this account produces 10 blocks, therefore it gets 10 / 100 = 10% of non-block-authority rewards = 7.5% of total rewards
    */
    import { onMount } from 'svelte';
    import { Spinner } from 'flowbite-svelte';
    import { config } from '../config';

    export let walletId: string;
    let apiData: any = null;

    onMount(() => {

    });

    const getRewards = async () => {
        //const rewards = await getRewardsForWallet(walletId);
        //console.log(rewards);
    }
</script>

<div class="p-6 bg-white dark:bg-gray-900 rounded-lg shadow-md">
    <h3 class="text-xl font-bold mb-6 text-gray-800 dark:text-gray-200">Rewards Summary</h3>
    {#if apiData === null}
        <div class="flex justify-center items-center h-64">
            <Spinner size="16" />
        </div>
{:else}
        <div class="space-y-4">

        </div>
    {/if}
</div>