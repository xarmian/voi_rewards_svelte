<script lang="ts">
    import { onMount } from 'svelte';
    export let walletAddress: string | undefined = undefined;

    type SortOption = {
        id: string;
        label: string;
    };

    const sortOptions: SortOption[] = [
        { id: 'name', label: 'Name' },
        { id: 'collection', label: 'Collection' }
    ];

    let selectedSort = sortOptions[0].id;
    let sortDirection: 'asc' | 'desc' = 'asc';

    interface NFTToken {
        name: string;
        floorPrice: number;
        ceilingPrice: number;
        lastSalePrice: number;
        imageUrl: string;
        tokenId: string;
        contractId: string;
        metadata?: {
            name?: string;
            image?: string;
            description?: string;
        };
        isListed?: boolean;
        listingPrice?: number;
        lastSaleTimestamp?: number;
        owner?: string;
        metadataURI?: string;
        collection?: {
            name?: string;
            totalSupply?: number;
            creator?: string;
        };
    }

    interface FungibleToken {
        name: string;
        symbol: string;
        balance: number;
        value: number;
        imageUrl: string;
    }

    let nftTokens: NFTToken[] = [];
    let isLoading = true;
    let error: string | null = null;
    let currentPage = 1;
    let hasNextPage = false;
    let nextToken: string | null = null;
    let collections: Map<string, any> = new Map();

    // Placeholder data for fungible tokens
    const fungibleTokens: FungibleToken[] = [
        {
            name: "Voi Token",
            symbol: "VOI",
            balance: 1000,
            value: 1000,
            imageUrl: "https://placehold.co/100x100"
        },
        {
            name: "Test Token",
            symbol: "TEST",
            balance: 500,
            value: 250,
            imageUrl: "https://placehold.co/100x100"
        }
    ];

    // Calculate total portfolio value
    $: totalValue = fungibleTokens.reduce((acc, token) => acc + token.value, 0) +
                    nftTokens.reduce((acc, nft) => acc + (nft.lastSalePrice || 0), 0);

    function handleImageError(event: Event) {
        const img = event.target as HTMLImageElement;
        if (img) {
            img.src = "https://placehold.co/100x100";
        }
    }

    function handleIconError(event: Event) {
        const img = event.target as HTMLImageElement;
        if (img) {
            img.style.display = 'none';
        }
    }

    async function fetchSalesHistory(contractId: string, tokenId: string) {
        try {
            const response = await fetch(
                `https://arc72-voi-mainnet.nftnavigator.xyz/nft-indexer/v1/mp/sales?collectionId=${contractId}&tokenId=${tokenId}&sort=-round&limit=1`
            );
            if (!response.ok) return null;
            const data = await response.json();
            return data.sales?.[0] || null;
        } catch (err) {
            console.error('Error fetching sales history:', err);
            return null;
        }
    }

    async function fetchListings(contractId: string, tokenId: string) {
        try {
            const response = await fetch(
                `https://arc72-voi-mainnet.nftnavigator.xyz/nft-indexer/v1/mp/listings?collectionId=${contractId}&tokenId=${tokenId}&active=true`
            );
            if (!response.ok) return null;
            const data = await response.json();
            return data.listings?.[0] || null;
        } catch (err) {
            console.error('Error fetching listings:', err);
            return null;
        }
    }

    async function fetchMetadata(metadataURI: string) {
        try {
            const response = await fetch(metadataURI);
            if (!response.ok) return null;
            return await response.json();
        } catch (err) {
            console.error('Error fetching metadata:', err);
            return null;
        }
    }

    async function fetchCollectionInfo(contractId: string) {
        if (collections.has(contractId)) {
            return collections.get(contractId);
        }

        try {
            const response = await fetch(
                `https://arc72-voi-mainnet.nftnavigator.xyz/nft-indexer/v1/collections?contractId=${contractId}`
            );
            if (!response.ok) return null;
            const data = await response.json();
            const collection = data.collections?.[0] || null;
            if (collection) {
                collections.set(contractId, collection);
            }
            return collection;
        } catch (err) {
            console.error('Error fetching collection:', err);
            return null;
        }
    }

    async function fetchNFTs(pageToken?: string) {
        if (!walletAddress) return;
        
        isLoading = true;
        error = null;
        try {
            const url = new URL('https://arc72-voi-mainnet.nftnavigator.xyz/nft-indexer/v1/tokens');
            url.searchParams.append('owner', walletAddress);
            url.searchParams.append('limit', '12');
            if (pageToken) {
                url.searchParams.append('next', pageToken);
            }

            const response = await fetch(url.toString());
            if (!response.ok) throw new Error('Failed to fetch NFTs');
            const data = await response.json();
            
            const nfts = await Promise.all(data.tokens.map(async (token: any) => {
                try {
                    const [lastSale, activeListing, metadata, collection] = await Promise.all([
                        fetchSalesHistory(token.contractId.toString(), token.tokenId.toString()),
                        fetchListings(token.contractId.toString(), token.tokenId.toString()),
                        token.metadataURI ? fetchMetadata(token.metadataURI) : null,
                        fetchCollectionInfo(token.contractId.toString())
                    ]);

                    let parsedMetadata = token.metadata;
                    if (typeof token.metadata === 'string') {
                        try {
                            parsedMetadata = JSON.parse(token.metadata);
                        } catch (e) {
                            console.error('Error parsing metadata JSON:', e);
                        }
                    }

                    const finalMetadata = metadata || parsedMetadata || {};

                    return {
                        name: finalMetadata.name || `NFT #${token.tokenId}`,
                        tokenId: token.tokenId.toString(),
                        contractId: token.contractId.toString(),
                        owner: token.owner,
                        metadataURI: token.metadataURI,
                        floorPrice: 0,
                        ceilingPrice: 0,
                        lastSalePrice: lastSale?.price || 0,
                        lastSaleTimestamp: lastSale?.createTimestamp,
                        imageUrl: finalMetadata.image || "https://placehold.co/100x100",
                        metadata: finalMetadata,
                        isListed: !!activeListing,
                        listingPrice: activeListing?.price,
                        collection: collection ? {
                            name: collection.name || `Collection #${token.contractId}`,
                            totalSupply: collection.totalSupply,
                            creator: collection.creator
                        } : undefined
                    };
                } catch (err) {
                    console.error('Error processing NFT:', err);
                    return {
                        name: `NFT #${token.tokenId}`,
                        tokenId: token.tokenId.toString(),
                        contractId: token.contractId.toString(),
                        owner: token.owner,
                        floorPrice: 0,
                        ceilingPrice: 0,
                        lastSalePrice: 0,
                        imageUrl: "https://placehold.co/100x100"
                    };
                }
            }));

            nftTokens = pageToken ? [...nftTokens, ...nfts] : nfts;
            nextToken = data['next-token'] || null;
            hasNextPage = !!data['next-token'];
        } catch (err) {
            console.error('Error fetching NFTs:', err);
            error = 'Failed to load NFTs. Please try again later.';
        } finally {
            isLoading = false;
        }
    }

    async function loadMore() {
        if (nextToken) {
            currentPage++;
            await fetchNFTs(nextToken);
        }
    }

    $: {
        if (walletAddress) {
            fetchNFTs();
        }
    }

    onMount(() => {
        if (walletAddress) {
            fetchNFTs();
        }
    });

    function getOptimizedImageUrl(imageUrl: string, metadataURI: string | undefined, width = 200): string {
        if (!imageUrl) return "https://placehold.co/100x100";
        
        // Check if it's a Highforge CDN URL
        if (imageUrl.includes('highforge.io')) {
            if (metadataURI) {
                return `https://prod.cdn.highforge.io/i/${encodeURIComponent(metadataURI)}?w=${width}`;
            }
        }
        return imageUrl;
    }

    function getTokenUrl(contractId: string, tokenId: string): string {
        return `https://nftnavigator.xyz/collection/${contractId}/token/${tokenId}`;
    }

    function getNautilusUrl(contractId: string, tokenId: string): string {
        return `https://nautilus.sh/collection/${contractId}/${tokenId}`;
    }

    function getHighforgeUrl(contractId: string, tokenId: string): string {
        return `https://highforge.io/collection/${contractId}/${tokenId}`;
    }

    function sortNFTs(nfts: NFTToken[]): NFTToken[] {
        return [...nfts].sort((a, b) => {
            let comparison = 0;
            switch (selectedSort) {
                case 'name':
                    comparison = (a.name || '').localeCompare(b.name || '');
                    break;
                case 'collection':
                    const collectionA = a.collection?.name || '';
                    const collectionB = b.collection?.name || '';
                    comparison = collectionA.localeCompare(collectionB);
                    if (comparison === 0) {
                        // Secondary sort by token ID within the same collection
                        comparison = parseInt(a.tokenId) - parseInt(b.tokenId);
                    }
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }

    function toggleSortDirection() {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }
</script>

<div class="space-y-6">
    <!-- Portfolio Overview -->
    <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Portfolio Overview</h2>
        <div class="text-right">
            <p class="text-sm text-gray-500 dark:text-gray-400">Total Value</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">${totalValue.toLocaleString()}</p>
        </div>
    </div>

    <!-- NFT Tokens Section -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div class="flex flex-col space-y-4 mb-6">
            <div class="flex items-center justify-between">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white">NFT Tokens</h3>
                {#if nftTokens.length > 0}
                    <div class="flex items-center space-x-2">
                        <select
                            bind:value={selectedSort}
                            class="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                        >
                            {#each sortOptions as option}
                                <option value={option.id}>{option.label}</option>
                            {/each}
                        </select>
                        <button
                            on:click={toggleSortDirection}
                            class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                            {#if sortDirection === 'asc'}
                                <i class="fas fa-sort-amount-up-alt"></i>
                            {:else}
                                <i class="fas fa-sort-amount-down"></i>
                            {/if}
                        </button>
                    </div>
                {/if}
            </div>

            <!-- Marketplace Links -->
            <div class="flex flex-col sm:flex-row gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div class="flex-1">
                    <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">Looking to buy NFTs? Check out these marketplaces:</p>
                    <div class="flex gap-2">
                        <a
                            href="https://nautilus.sh"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                        >
                            <img 
                                src="https://nautilus.sh/favicon.ico" 
                                alt="Nautilus" 
                                class="w-4 h-4 mr-1.5"
                                on:error={handleIconError}
                            />
                            Nautilus
                        </a>
                        <a
                            href="https://highforge.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                        >
                            <img 
                                src="https://highforge.io/favicon.ico" 
                                alt="Highforge" 
                                class="w-4 h-4 mr-1.5"
                                on:error={handleIconError}
                            />
                            Highforge
                        </a>
                    </div>
                </div>
            </div>
        </div>

        {#if isLoading && !nftTokens.length}
            <div class="flex justify-center items-center h-32">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            </div>
        {:else if error && !nftTokens.length}
            <div class="text-red-500 dark:text-red-400 text-center py-4">
                {error}
            </div>
        {:else if !nftTokens.length}
            <div class="text-gray-500 dark:text-gray-400 text-center py-4">
                No NFTs found in this wallet.
            </div>
        {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {#each sortNFTs(nftTokens) as nft}
                    <a 
                        href={getTokenUrl(nft.contractId, nft.tokenId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="block bg-gray-50 dark:bg-gray-700 rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                        <div class="flex items-center space-x-4">
                            <img 
                                src={getOptimizedImageUrl(nft.imageUrl, nft.metadataURI)}
                                alt={nft.name} 
                                class="w-16 h-16 rounded-lg object-cover"
                                on:error={handleImageError}
                            />
                            <div class="flex-1 min-w-0">
                                <h4 class="font-medium text-gray-900 dark:text-white truncate">{nft.name}</h4>
                                {#if nft.collection?.name}
                                    <p class="text-sm text-purple-600 dark:text-purple-400">{nft.collection.name}</p>
                                {/if}
                                <p class="text-sm text-gray-500 dark:text-gray-400">Token ID: {nft.tokenId}</p>
                                {#if nft.metadata?.description}
                                    <p class="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                                        {nft.metadata.description}
                                    </p>
                                {/if}
                                <div class="mt-2 space-y-1 text-sm">
                                    {#if nft.isListed}
                                        <p class="text-green-600 dark:text-green-400">Listed: ${nft.listingPrice?.toLocaleString() ?? 0}</p>
                                    {/if}
                                    {#if nft.lastSalePrice}
                                        <p class="text-gray-600 dark:text-gray-300">
                                            Last Sale: ${nft.lastSalePrice.toLocaleString()}
                                            {#if nft.lastSaleTimestamp}
                                                <span class="text-xs">
                                                    ({new Date(nft.lastSaleTimestamp * 1000).toLocaleDateString()})
                                                </span>
                                            {/if}
                                        </p>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    </a>
                {/each}
            </div>

            {#if hasNextPage}
                <div class="mt-6 text-center">
                    <button
                        class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors {isLoading ? 'opacity-50 cursor-not-allowed' : ''}"
                        on:click={loadMore}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Loading...' : 'Load More'}
                    </button>
                </div>
            {/if}
        {/if}
    </div>

    <!-- Fungible Tokens Section -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Fungible Tokens</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each fungibleTokens as token}
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div class="flex items-center space-x-4">
                        <img 
                            src={token.imageUrl} 
                            alt={token.name} 
                            class="w-16 h-16 rounded-lg object-cover"
                            on:error={handleImageError}
                        />
                        <div>
                            <h4 class="font-medium text-gray-900 dark:text-white">{token.name}</h4>
                            <p class="text-sm text-gray-500 dark:text-gray-400">{token.symbol}</p>
                            <div class="mt-2 space-y-1 text-sm">
                                <p class="text-gray-600 dark:text-gray-300">Balance: {token.balance.toLocaleString()}</p>
                                <p class="text-gray-600 dark:text-gray-300">Value: ${token.value.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    </div>
</div> 