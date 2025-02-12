<script lang="ts">
    import { algodIndexer } from '$lib/utils/algod';
    import { dataTable } from '../../stores/dataTable';
    import { getTokensByEpoch } from '$lib/utils';
    import { getSupplyInfo } from '$lib/stores/accounts';
    import type { DateRange } from '../../stores/dataTable';
    import { config } from '$lib/config';
    import { Tabs, TabItem } from 'flowbite-svelte';
    import EpochTable from '$lib/components/EpochTable.svelte';
    import EpochChart from '$lib/components/EpochChart.svelte';

    export let walletAddress: string;
    const rewardsAddress: string[] = ['62TIVJSZOS4DRSSYYDDZELQAGFYQC5JWKCHRBPPYKTZN2OOOXTGLB5ZJ4E','CAGQDUFUPI6WAQCIQZHPHMX2Z7KACAKZWOMI4R72JV24U4AVAJTGCHA2BE'];
    
    let transactions: any[] = [];
    let epochData: any[] = [];
    let mergedData: any[] = [];
    let isLoading = true;
    let dataLastUpdated: Date | null = null;

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
                const snapshots = epochSummary.snapshots ? epochSummary.snapshots : epochSummary;
                if (epochSummary.last_updated) {
                    dataLastUpdated = new Date(epochSummary.last_updated * 1000);
                }

                const epochData = snapshots.find((e: any) => e.start_date === formattedDate);
                if (!epochData) return null;

                const communityBlocks = epochData.total_blocks ?? 0;
                const totalBlocksProduced = Math.round(communityBlocks + (Math.min(epochData.ballast_blocks ?? 0, communityBlocks / 3)));
                const userBlocksProduced = epochData.proposers[walletAddress] ?? 0;
                const tokens = await getTokensByEpoch(date.epoch);
                console.log(tokens, userBlocksProduced, totalBlocksProduced, communityBlocks);
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

    // Add reactive statement for pagination and currentPage changes
    $: {
        if (mergedData.length > 0 || currentPage) {
            updatePagination();
        }
    }

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
        <Tabs style="underline">
            <TabItem open>
                <div slot="title" class="flex items-center gap-2">
                    <i class="fas fa-table"></i>
                    <span>Table View</span>
                </div>
                <EpochTable 
                    {mergedData}
                    bind:currentPage
                    {totalPages}
                    {paginatedData}
                    {dataLastUpdated}
                />
            </TabItem>
            <TabItem>
                <div slot="title" class="flex items-center gap-2">
                    <i class="fas fa-chart-bar"></i>
                    <span>Chart View</span>
                </div>
                <EpochChart {mergedData} />
            </TabItem>
        </Tabs>
    {/if}
</div>