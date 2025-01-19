<script lang="ts">
    import { Card } from 'flowbite-svelte';

    export let mergedData: any[] = [];
    export let currentPage = 1;
    export let totalPages = 1;
    export let paginatedData: any[] = [];
    export let dataLastUpdated: Date | null = null;

    const goToPage = (page: number) => {
        currentPage = page;
    };
</script>

<div class="flex flex-col w-full">
    <!-- Desktop view (hidden on small screens) -->
    <div class="hidden sm:block overflow-x-auto">
        <table class="w-full border-collapse">
            <thead>
                <tr class="bg-gray-200 dark:bg-gray-700">
                    <th class="p-2 text-left">Epoch</th>
                    <th class="p-2 text-left">Status</th>
                    <th class="p-2 text-left">Date Range</th>
                    <th class="p-2 text-left">Blocks Produced</th>
                    <th class="p-2 text-right">Reward Estimate</th>
                    <th class="p-2 text-right">Actual Reward</th>
                    <th class="p-2 text-left">Reward Received</th>
                </tr>
            </thead>
            <tbody>
                {#each paginatedData as data}
                    <tr class="border-b dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <td class="p-2">{data.epoch}</td>
                        <td class="p-2" title={
                            data.isEpochInProgress ? 'Epoch in progress' : 
                            data.rewardDate ? 'Reward received' : 
                            data.status === 'pending' ? 'Pending' : '-'
                        }>
                            {#if data.isEpochInProgress}
                                🔄
                            {:else if data.rewardDate}
                                ✓
                            {:else if data.status === 'pending'}
                                ⏳
                            {:else}
                                -
                            {/if}
                        </td>

                        <td class="p-2">{data.startDate.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })} - {data.endDate.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })}</td>
                        <td class="p-2">{data.userBlocksProduced} / {data.totalBlocksProduced}</td>
                        <td class="p-2 text-right">
                            {data.expectedReward.toFixed(2)} VOI
                        </td>
                        <td class="p-2 text-right">
                            {#if data.actualReward}
                                {data.actualReward.toFixed(2)} VOI
                            {/if}
                        </td>
                        <td class="p-2">
                            {#if data.isEpochInProgress}
                                <span class="text-blue-600 dark:text-blue-400">(epoch in progress)</span>
                            {:else if data.rewardDate}
                                <div class="flex justify-between">
                                    {data.rewardDate.toLocaleString()}
                                    <button aria-label="View on Explorer" class="text-blue-600 dark:text-blue-400 underline" on:click={() => window.open(`https://explorer.voi.network/explorer/transaction/${data.rewardTxId}`, '_blank')}>
                                        <i class="fa-solid fa-eye"></i>
                                    </button>
                                </div>
                            {:else}
                                <span class="text-red-600 dark:text-red-400">
                                    {data.status === 'pending' ? '(pending)' : '-'}
                                </span>
                            {/if}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>

        <!-- Pagination controls -->
        {#if totalPages > 1}
            <div class="flex justify-center items-center gap-2 mt-4">
                <button 
                    class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                    disabled={currentPage === 1}
                    on:click={() => goToPage(currentPage - 1)}
                >
                    Previous
                </button>
                
                {#each Array(totalPages) as _, i}
                    <button 
                        class="px-3 py-1 rounded {currentPage === i + 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}"
                        on:click={() => goToPage(i + 1)}
                    >
                        {i + 1}
                    </button>
                {/each}
                
                <button 
                    class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                    disabled={currentPage === totalPages}
                    on:click={() => goToPage(currentPage + 1)}
                >
                    Next
                </button>
            </div>
        {/if}
    </div>

    <!-- Mobile view (visible only on small screens) -->
    <div class="sm:hidden space-y-4">
        {#each paginatedData as data}
            <Card class="bg-gray-100 dark:bg-gray-700">
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span class="font-bold">Epoch {data.epoch}</span>
                        <span title={
                            data.isEpochInProgress ? 'Epoch in progress' : 
                            data.rewardDate ? 'Reward received' : 
                            data.status === 'pending' ? 'Pending' : '-'
                        }>
                            {#if data.isEpochInProgress}
                                🔄
                            {:else if data.rewardDate}
                                ✓
                            {:else if data.status === 'pending'}
                                ⏳
                            {:else}
                                -
                            {/if}
                        </span>
                    </div>
                    <a class="grid grid-cols-2 gap-2 text-sm" href={`https://explorer.voi.network/explorer/transaction/${data.rewardTxId}`} target="_blank">
                        <div>Date Range:</div>
                        <div>{data.startDate.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })} - {data.endDate.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })}</div>
                        
                        <div>Blocks:</div>
                        <div>{data.userBlocksProduced} / {data.totalBlocksProduced}</div>
                        
                        <div>Estimate:</div>
                        <div>{data.expectedReward.toFixed(2)} VOI</div>
                        
                        <div>Actual:</div>
                        <div>
                            {#if data.isEpochInProgress}
                                <span class="text-blue-600 dark:text-blue-400">Epoch in progress</span>
                            {:else if data.actualReward}
                                {data.actualReward.toFixed(2)} VOI
                            {:else}
                                <span class="text-gray-600 dark:text-gray-400">
                                    {data.status === 'pending' ? 'Pending' : '-'}
                                </span>
                            {/if}
                        </div>
                        
                        {#if !data.isEpochInProgress && data.rewardDate}
                            <div>Reward Received:</div>
                            <div>
                                {data.rewardDate.toLocaleString()}
                            </div>
                        {/if}
                    </a>    
                </div>
            </Card>
        {/each}

        <!-- Mobile pagination controls -->
        {#if totalPages > 1}
            <div class="flex justify-center items-center gap-2 mt-4">
                <button 
                    class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                    disabled={currentPage === 1}
                    on:click={() => goToPage(currentPage - 1)}
                >
                    Previous
                </button>
                
                <span class="px-3">Page {currentPage} of {totalPages}</span>
                
                <button 
                    class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                    disabled={currentPage === totalPages}
                    on:click={() => goToPage(currentPage + 1)}
                >
                    Next
                </button>
            </div>
        {/if}
    </div>
    {#if dataLastUpdated}
        <div class="text-sm text-gray-500 dark:text-gray-400 text-right">
            Data is delayed. Last updated: {dataLastUpdated.toLocaleString()}
        </div>
    {/if}
</div>

<style lang="postcss">
    th {
        @apply font-semibold;
    }
    
    td, th {
        @apply text-sm;
    }
</style> 