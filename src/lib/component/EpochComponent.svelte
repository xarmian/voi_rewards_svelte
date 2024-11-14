<script lang="ts">
    import { algodIndexer } from '$lib/utils/algod';
    import { dataTable } from '../../stores/dataTable';
    import { Card } from 'flowbite-svelte';
    import { getTokensByEpoch } from '$lib/utils';
    import { getSupplyInfo } from '$lib/stores/accounts';
    import type { DateRange } from '../../stores/dataTable';
	import { config } from '$lib/config';

    export let walletAddress: string;
    const rewardsAddress: string[] = ['62TIVJSZOS4DRSSYYDDZELQAGFYQC5JWKCHRBPPYKTZN2OOOXTGLB5ZJ4E','CAGQDUFUPI6WAQCIQZHPHMX2Z7KACAKZWOMI4R72JV24U4AVAJTGCHA2BE'];
    
    let transactions: any[] = [];
    let epochData: any[] = [];
    let mergedData: any[] = [];
    let isLoading = true;

    // Add pagination variables
    let currentPage = 1;
    const itemsPerPage = 15;
    let totalPages = 1;
    let paginatedData: typeof mergedData = [];

    const filterTransactions = (address: string[], txns: any[]) => {
        return txns.filter((tx: any) => address.includes(tx.sender));
    };

    const loadTransactions = async () => {
        try {
            const transfers = await algodIndexer
                .searchForTransactions()
                .address(walletAddress)
                .addressRole('receiver')
                .limit(100)
                .do();

            return filterTransactions(rewardsAddress, transfers.transactions);
        } catch (error) {
            console.error('Failed to fetch transactions:', error);
            return [];
        }
    };

    const loadEpochData = async () => {
        try {
            const dates: DateRange[] = await dataTable.fetchDateRanges();
            const epochSummary = await fetch(`${config.proposalApiBaseUrl}?action=epoch-summary&wallet=${walletAddress}`).then(r => r.json());
            
            const [supplyData] = await Promise.all([
                getSupplyInfo()
            ]);

            if (!supplyData) {
                throw new Error('Failed to fetch supply data');
            }

            const epochPromises = dates.map(async (date: DateRange) => {
                const [startStr] = date.id.split('-');
                const formattedDate = `${startStr.slice(0,4)}-${startStr.slice(4,6)}-${startStr.slice(6,8)}T00:00:00Z`;
                const epochData = epochSummary.find((e: any) => e.start_date === formattedDate);
                if (!epochData) return null;

                const communityBlocks = epochData.total_blocks ?? 0;
                const totalBlocksProduced = Math.round(communityBlocks + (Math.min(epochData.ballast_blocks ?? 0, communityBlocks) / 3));
                const userBlocksProduced = epochData.proposers[walletAddress] ?? 0;
                const tokens = await getTokensByEpoch(date.epoch);
                const expectedReward = tokens * (userBlocksProduced / totalBlocksProduced);

                return {
                    epoch: date.epoch,
                    startDate: new Date(epochData.start_date),
                    endDate: new Date(epochData.end_date),
                    expectedReward,
                    totalBlocksProduced,
                    userBlocksProduced
                };
            });

            // Wait for all promises to resolve and filter out null values
            return (await Promise.all(epochPromises)).filter((data): data is NonNullable<typeof data> => data !== null);
        } catch (error) {
            console.error('Failed to fetch epoch data:', error);
            return [];
        }
    };

    const mergeData = () => {
        const now = new Date();
        
        // Reverse the order of epochs and store in mergedData
        mergedData = epochData.map(epoch => {
            const rewardStartDate = new Date(epoch.endDate);
            const rewardEndDate = new Date(epoch.endDate);
            rewardStartDate.setDate(rewardStartDate.getDate());
            rewardEndDate.setDate(rewardEndDate.getDate() + 7);

            const rewardTx = transactions.find(tx => 
                tx['round-time'] >= rewardStartDate.getTime()/1000 && 
                tx['round-time'] <= rewardEndDate.getTime()/1000
            );

            return {
                ...epoch,
                isEpochInProgress: now >= epoch.startDate && now <= epoch.endDate,
                actualReward: rewardTx ? rewardTx['payment-transaction'].amount / 1e6 : null,
                rewardDate: rewardTx ? new Date(rewardTx['round-time'] * 1000) : null,
                rewardTxId: rewardTx ? rewardTx.id : null,
                status: now >= epoch.startDate && now <= epoch.endDate ? 'in-progress' : 
                       (now <= rewardEndDate ? 'pending' : 'no-reward')
            };
        }).sort((a, b) => b.epoch - a.epoch); // Sort in descending order

        updatePagination();
    };

    const updatePagination = () => {
        totalPages = Math.ceil(mergedData.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        paginatedData = mergedData.slice(startIndex, endIndex);
    };

    // Add reactive statement for pagination
    $: {
        if (mergedData.length > 0) {
            updatePagination();
        }
    }

    const goToPage = (page: number) => {
        currentPage = page;
        updatePagination();
    };

    // Add a reactive statement to reload data when walletAddress changes
    $: {
        if (walletAddress) {
            isLoading = true;
            Promise.all([
                loadTransactions(),
                loadEpochData()
            ]).then(([newTransactions, newEpochData]) => {
                transactions = newTransactions;
                epochData = newEpochData;
                mergeData();
            }).finally(() => {
                isLoading = false;
            });
        }
    }
</script>

<div class="flex flex-col w-full">
    {#if isLoading}
        <div class="text-center py-4">Loading...</div>
    {:else}
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

                            <td class="p-2">{data.startDate.toLocaleDateString()} - {data.endDate.toLocaleDateString()}</td>
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
                                        <button class="text-blue-600 dark:text-blue-400 underline" on:click={() => window.open(`https://explorer.voi.network/explorer/transaction/${data.rewardTxId}`, '_blank')}>
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
                            <div>{data.startDate.toLocaleDateString()} - {data.endDate.toLocaleDateString()}</div>
                            
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
    {/if}
</div>

<style>
    th {
        @apply font-semibold;
    }
    
    td, th {
        @apply text-sm;
    }
</style>
