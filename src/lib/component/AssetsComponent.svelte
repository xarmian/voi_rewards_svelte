<script lang="ts">
    import { onMount } from 'svelte';
    import { algodClient } from '$lib/utils/algod';
    import { Card, Spinner } from 'flowbite-svelte';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';
    import ExternalLink from '$lib/components/ExternalLink.svelte';

    export let walletId: string;

    let assets: any[] = [];
    let isLoading = true;

    async function fetchAssets() {
        startLoading();
        isLoading = true;
        try {
            // Fetch assets from Algorand client
            const accountInfo = await algodClient.accountInformation(walletId).do();
            const algoAssets = accountInfo['assets'] || [];

            // Fetch assets from API endpoint
            const apiResponse = await fetch(`/api/assets?address=${walletId}`);
            const apiAssets = await apiResponse.json();

            // Merge and deduplicate assets
            const mergedAssets = [...algoAssets, ...apiAssets];
            assets = mergedAssets.reduce((acc, current) => {
                const x = acc.find(item => item['asset-id'] === current['asset-id']);
                if (!x) {
                    return acc.concat([current]);
                } else {
                    return acc;
                }
            }, []);

        } catch (error) {
            console.error('Failed to fetch assets:', error);
        } finally {
            isLoading = false;
            stopLoading();
        }
    }

    onMount(() => {
        fetchAssets();
    });

    function formatAmount(amount: number, decimals: number): string {
        return (amount / Math.pow(10, decimals)).toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals
        });
    }
</script>

<div class="space-y-4">
    <h2 class="text-2xl font-bold mb-4">Assets</h2>
    
    {#if isLoading}
        <div class="flex justify-center items-center h-32">
            <Spinner size="xl" />
        </div>
    {:else if assets.length === 0}
        <p class="text-center text-gray-500">No assets found for this account.</p>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each assets as asset}
                <Card>
                    <h5 class="mb-2 text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                        {asset.name || `Asset #${asset['asset-id']}`}
                    </h5>
                    <p class="font-normal text-gray-700 dark:text-gray-400">
                        Balance: {formatAmount(asset.amount, asset.decimals)} {asset['unit-name'] || ''}
                    </p>
                    <ExternalLink 
                        href={`https://explorer.voi.network/explorer/asset/${asset['asset-id']}`}
                        text="View on Explorer"
                        details="Open asset details in Voi Explorer (new tab)"
                    />
                </Card>
            {/each}
        </div>
    {/if}
</div>