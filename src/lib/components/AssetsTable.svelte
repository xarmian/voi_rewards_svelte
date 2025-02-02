<script lang="ts">
    import { Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell, TableSearch } from 'flowbite-svelte';
    import type { FungibleTokenType, NFTToken, ASAToken, UnifiedAsset, LPToken } from '../types/assets';
    import { getTokenUrl, getPoolUrl, getAsaExplorerUrl, getVoiagerUrl, getAddLiquidityUrl } from '../utils/urls';
    import CopyComponent from '$lib/component/ui/CopyComponent.svelte';
    import { Button } from 'flowbite-svelte';
    import { Search } from 'flowbite-svelte';
    import { Select } from 'flowbite-svelte';

    export let fungibleTokens: (FungibleTokenType | LPToken)[] = [];
    export let nftTokens: NFTToken[] = [];
    export let asaTokens: ASAToken[] = [];
    export let voiPrice: number;

    let searchTerm = '';
    let sortField = 'value';
    let sortDirection = 'desc';
    let showZeroBalances = false;

    function isLPToken(token: FungibleTokenType | LPToken): token is LPToken {
        return 'poolInfo' in token && token.poolInfo !== undefined;
    }

    function calculateLPTokenValue(token: UnifiedAsset): number {
        if (!token.poolInfo) return 0;

        const userShare = token.balance / Number(token.poolInfo.totalSupply);
        const tokABalance = Number(token.poolInfo.tokABalance);
        const tokBBalance = Number(token.poolInfo.tokBBalance);

        // If either token is VOI (id = 0), use its balance for value calculation
        if (token.poolInfo.tokAId === '0') {
            return (tokABalance * userShare * 2) / 1e6; // Multiply by 2 since it's paired
        } else if (token.poolInfo.tokBId === '0') {
            return (tokBBalance * userShare * 2) / 1e6;
        }

        // If neither token is VOI, return 0 for now
        // TODO: Implement price calculation for non-VOI pairs
        return 0;
    }

    function createUnifiedAsset(token: any, type: 'ASA' | 'Fungible' | 'NFT' | 'LP'): UnifiedAsset {
        const baseAsset = {
            id: type === 'ASA' ? token.assetId.toString() : token.id,
            name: token.name || '',
            type,
            balance: type === 'ASA' ? token.amount : token.balance,
            value: type === 'LP' && token.poolInfo ? calculateLPTokenValue(token) : (token.value || 0),
            symbol: type === 'ASA' ? token.unitName : token.symbol,
            imageUrl: token.imageUrl || null,
            contractId: type === 'ASA' ? token.assetId.toString() : token.id,
            tokenId: type === 'NFT' ? token.tokenId : undefined,
            poolInfo: type === 'LP' && token.poolInfo ? {
                ...token.poolInfo,
                poolId: token.poolId
            } : undefined
        };

        return baseAsset;
    }

    $: assets = [
        ...asaTokens.map(token => createUnifiedAsset(token, 'ASA')),
        ...fungibleTokens
            .filter(token => !isLPToken(token))
            .map(token => createUnifiedAsset(token, 'Fungible')),
        ...fungibleTokens
            .filter(isLPToken)
            .map(token => createUnifiedAsset(token, 'LP')),
        ...nftTokens.map(token => createUnifiedAsset(token, 'NFT'))
    ];

    $: filteredAssets = assets
        .filter(asset => {
            const searchLower = searchTerm.toLowerCase();
            return (
                asset.name?.toLowerCase().includes(searchLower) ||
                asset.symbol?.toLowerCase().includes(searchLower) ||
                (asset.type === 'LP' && asset.poolInfo && 
                    (`${asset.poolInfo.tokASymbol}/${asset.poolInfo.tokBSymbol}`).toLowerCase().includes(searchLower))
            );
        })
        .sort((a, b) => {
            if (sortField === 'value' || sortField === 'balance' || sortField === 'name') {
                const aValue = a[sortField];
                const bValue = b[sortField];
                return sortDirection === 'asc' 
                    ? (aValue > bValue ? 1 : -1)
                    : (bValue > aValue ? 1 : -1);
            }
            return 0;
        });

    function handleSort(key: keyof UnifiedAsset) {
        if (sortField === key) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortField = key;
            sortDirection = 'desc';
        }
    }

    function formatValue(value: number): string {
        return value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
        });
    }

    function handleImageError(event: Event) {
        const target = event.target as HTMLImageElement;
        if (target) {
            target.style.display = 'none';
        }
    }
</script>

<div class="space-y-4">
    <div class="flex flex-col sm:flex-row gap-4">
        <Search bind:value={searchTerm} size="md" placeholder="Search assets..." class="flex-grow" />
        <Select class="w-full sm:w-48" bind:value={sortField}>
            <option value="value">Sort by Value</option>
            <option value="name">Sort by Name</option>
            <option value="balance">Sort by Balance</option>
        </Select>
        <Select class="w-full sm:w-48" bind:value={sortDirection}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
        </Select>
    </div>

    <div class="flex items-center justify-between gap-4">
        <label class="inline-flex items-center cursor-pointer">
            <input 
                type="checkbox" 
                bind:checked={showZeroBalances} 
                class="sr-only peer"
            >
            <div class="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">Show zero balances</span>
        </label>
    </div>

    <div class="overflow-x-auto">
        <Table>
            <TableHead>
                <TableHeadCell>
                    <button class="flex items-center" on:click={() => handleSort('type')}>
                        Type
                        <i class="fas fa-sort ml-1"></i>
                    </button>
                </TableHeadCell>
                <TableHeadCell>
                    <button class="flex items-center" on:click={() => handleSort('name')}>
                        Name
                        <i class="fas fa-sort ml-1"></i>
                    </button>
                </TableHeadCell>
                <TableHeadCell>Symbol</TableHeadCell>
                <TableHeadCell>
                    <button class="flex items-center" on:click={() => handleSort('balance')}>
                        Balance
                        <i class="fas fa-sort ml-1"></i>
                    </button>
                </TableHeadCell>
                <TableHeadCell>
                    <button class="flex items-center" on:click={() => handleSort('value')}>
                        Value (VOI)
                        <i class="fas fa-sort ml-1"></i>
                    </button>
                </TableHeadCell>
                <TableHeadCell>Value (USD)</TableHeadCell>
                <TableHeadCell>Actions</TableHeadCell>
            </TableHead>
            <TableBody>
                {#each filteredAssets as asset}
                    <TableBodyRow>
                        <TableBodyCell>
                            <span class="px-2 py-1 text-xs font-medium rounded-full
                                {asset.type === 'NFT' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                                 asset.type === 'Fungible' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                                 asset.type === 'LP' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                                 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'}">
                                {asset.type}
                            </span>
                        </TableBodyCell>
                        <TableBodyCell>
                            <div class="flex items-center space-x-2">
                                {#if asset.imageUrl}
                                    <img 
                                        src={asset.imageUrl} 
                                        alt={asset.name}
                                        class="w-6 h-6 rounded-full"
                                        on:error={handleImageError}
                                    />
                                {/if}
                                <span>{asset.name}</span>
                                {#if asset.type === 'LP' && asset.poolInfo}
                                    <span class="text-xs text-gray-500 dark:text-gray-400">
                                        ({asset.poolInfo.tokASymbol}/{asset.poolInfo.tokBSymbol})
                                    </span>
                                {/if}
                            </div>
                        </TableBodyCell>
                        <TableBodyCell>
                            {#if asset.type === 'LP'}
                                <span class="text-xs">LP Token</span>
                            {:else}
                                {asset.symbol}
                            {/if}
                        </TableBodyCell>
                        <TableBodyCell>{formatValue(asset.balance)}</TableBodyCell>
                        <TableBodyCell>{formatValue(asset.value)}</TableBodyCell>
                        <TableBodyCell>${formatValue(asset.value * voiPrice)}</TableBodyCell>
                        <TableBodyCell>
                            <div class="flex items-center space-x-2">
                                {#if asset.type === 'NFT' && asset.tokenId}
                                    <a
                                        href={getTokenUrl(asset.contractId, asset.tokenId)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                        title="View on NFT Navigator"
                                    >
                                        <i class="fas fa-external-link-alt"></i>
                                    </a>
                                {:else if asset.type === 'LP' && asset.poolInfo?.poolId}
                                    <Button size="xs" href={getAddLiquidityUrl(asset.poolInfo.poolId)} target="_blank">
                                        Add Liquidity
                                    </Button>
                                {:else if asset.type === 'Fungible'}
                                    <div class="flex items-center space-x-2">
                                        <a
                                            href={getVoiagerUrl(asset.contractId)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                            title="View on Voiager"
                                        >
                                            <i class="fas fa-chart-line"></i>
                                        </a>
                                        {#if asset.poolId}
                                            <a
                                                href={getPoolUrl(asset.poolId)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                class="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                                                title="Trade on Humble"
                                            >
                                                <i class="fas fa-exchange-alt"></i>
                                            </a>
                                        {/if}
                                    </div>
                                {:else if asset.type === 'ASA'}
                                    <a
                                        href={getAsaExplorerUrl(asset.contractId)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300"
                                        title="View on Explorer"
                                    >
                                        <i class="fas fa-search"></i>
                                    </a>
                                {/if}
                                <CopyComponent
                                    text={asset.contractId}
                                    toastMessage="Asset ID copied to clipboard"
                                    failureMessage="Failed to copy Asset ID"
                                >
                                    <i class="fas fa-copy text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"></i>
                                </CopyComponent>
                            </div>
                        </TableBodyCell>
                    </TableBodyRow>
                {/each}
            </TableBody>
        </Table>
    </div>
</div> 