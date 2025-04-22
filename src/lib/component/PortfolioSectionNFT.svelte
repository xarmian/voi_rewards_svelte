<script lang="ts">
    import type { NFTToken } from '../types/assets';
    import { resolveEnvoiToken } from '../utils/envoi';

    type SortOption = {
        id: string;
        label: string;
    };

    const sortOptions: SortOption[] = [
        { id: 'name', label: 'Name' },
        { id: 'collection', label: 'Collection' },
        { id: 'tokenId', label: 'Token ID' },
        // { id: 'lastSalePrice', label: 'Last Sale Price' }
    ];

    export let walletAddress: string | null = null;
    export let handleIconError: (event: Event) => void = () => {};

    let isLoading = true;
    let error: string | null = null;
    let currentPage = 1;
    let itemsPerPage = 12;
    let allNftTokens: NFTToken[] = [];
    let displayedNftTokens: NFTToken[] = [];
    let totalPages = 0;
    let collections: Map<string, any> = new Map();
    let selectedSort = sortOptions[0].id;
    let sortDirection: 'asc' | 'desc' = 'asc';
    let isLoadingNFTs = false;
    let searchQuery = '';
    let selectedCollection = 'all';
    let uniqueCollections: string[] = [];
    let showOnlyListed = false;

    // Update the filteredNfts whenever filters change
    $: filteredNftTokens = allNftTokens.filter(nft => {
        // Check if it matches search query
        const matchesSearch = !searchQuery || 
            nft.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            nft.tokenId.toLowerCase().includes(searchQuery.toLowerCase()) ||
            nft.collection?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
            false;
        
        // Check if it matches collection filter
        const matchesCollection = selectedCollection === 'all' || 
            nft.collection?.name === selectedCollection;
        
        // Check listing status if filter is enabled
        const matchesListing = !showOnlyListed || nft.isListed;
            
        return matchesSearch && matchesCollection && matchesListing;
    });

    // Update collections list whenever NFTs are loaded
    $: {
        if (allNftTokens.length > 0) {
            // Extract unique collection names
            const collectionNames = allNftTokens
                .map(nft => nft.collection?.name)
                .filter((name): name is string => !!name);
            uniqueCollections = [...new Set(collectionNames)].sort();
        }
    }

    // Update displayed NFTs when filtered tokens change
    $: {
        if (filteredNftTokens) {
            updateDisplayedNfts();
        }
    }

    // Reset to page 1 when filters change
    $: {
        if (searchQuery || selectedCollection || showOnlyListed) {
            currentPage = 1;
        }
    }

    function handleImageError(event: Event) {
        const img = event.target as HTMLImageElement;
        if (img) {
            img.src = "https://placehold.co/100x100";
        }
    }

    async function refreshNFTs() {
        isLoadingNFTs = true;
        try {
            await fetchNFTs();
        } catch (error) {
            console.error('Error refreshing NFTs:', error);
        } finally {
            isLoadingNFTs = false;
        }
    }

    function getTokenUrl(contractId: string, tokenId: string): string {
        return `https://nftnavigator.xyz/collection/${contractId}/token/${tokenId}`;
    }

    function getOptimizedImageUrl(imageUrl: string, metadataURI: string | undefined, width = 200): string {
        if (!imageUrl) return "https://placehold.co/100x100";
        
        // Check if it's a Highforge CDN URL
        if (imageUrl.includes('highforge.io') && !imageUrl.includes('?')) {
            if (metadataURI) {
                return `https://prod.cdn.highforge.io/i/${encodeURIComponent(metadataURI)}?w=${width}`;
            }
        }
        else if (imageUrl && imageUrl.includes('ipfs://')) {
            return imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
        }
        return imageUrl;
    }

    function goToPreviousPage() {
        if (currentPage > 1) {
            currentPage--;
            updateDisplayedNfts();
        }
    }

    function goToNextPage() {
        if (currentPage < totalPages) {
            currentPage++;
            updateDisplayedNfts();
        }
    }

    async function fetchNFTs() {
        if (!walletAddress) return;
        
        isLoading = true;
        error = null;
        try {
            //const url = new URL('https://arc72-voi-mainnet.nftnavigator.xyz/nft-indexer/v1/tokens');
            const url = new URL('https://voi-mainnet-mimirapi.nftnavigator.xyz/nft-indexer/v1/tokens');
            url.searchParams.append('owner', walletAddress);

            const response = await fetch(url.toString());
            if (!response.ok) throw new Error('Failed to fetch NFTs');
            const data = await response.json();
            
            // Get unique contract IDs that we haven't fetched yet
            const uniqueContractIds = [...new Set(data.tokens.map((token: any) => token.contractId.toString()))] as string[];
            const contractIdsToFetch = uniqueContractIds.filter(id => !collections.has(id));
            
            if (contractIdsToFetch.length > 0) {
                // Fetch all new collections in parallel
                const fetchedCollections = await Promise.all(
                    contractIdsToFetch.map(contractId => fetchCollectionInfo(contractId))
                );

                // Update collections map with new results
                contractIdsToFetch.forEach((contractId, index) => {
                    const collection = fetchedCollections[index];
                    if (collection) {
                        collections.set(contractId, collection);
                    }
                });
            }

            allNftTokens = data.tokens.map((token: any) => {
                try {
                    let parsedMetadata = token.metadata;
                    if (typeof token.metadata === 'string') {
                        try {
                            parsedMetadata = JSON.parse(token.metadata);
                        } catch (e) {
                            // console.error('Error parsing metadata JSON:', e); // silent fail
                        }
                    }

                    const finalMetadata = parsedMetadata || {};
                    const collection = collections.get(token.contractId.toString());
                    const collectionName = finalMetadata.name?.replace(/(\d+|#)(?=\s*\S*$)/g, '') ?? 'Collection #' + token.contractId;

                    return {
                        name: finalMetadata.name || `NFT #${token.tokenId}`,
                        tokenId: token.tokenId.toString(),
                        contractId: token.contractId.toString(),
                        owner: token.owner,
                        metadataURI: token.metadataURI,
                        floorPrice: 0,
                        ceilingPrice: 0,
                        lastSalePrice: 0,
                        lastSaleTimestamp: 0,
                        imageUrl: finalMetadata.image || "https://placehold.co/100x100",
                        metadata: finalMetadata,
                        isListed: false,
                        listingPrice: 0,
                        collection: collection ? {
                            name: collectionName,
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
            });

            // if there are any envoi tokens, resolve them before updating the displayed NFTs
            const envoiTokens = allNftTokens.filter(token => token.contractId === '797609' || token.contractId === '876578');
            if (envoiTokens.length > 0) {
                const tokenData = await resolveEnvoiToken(envoiTokens.map(token => token.tokenId));
                console.log(tokenData);
                tokenData.forEach(token => {
                    const matchingToken = allNftTokens.find(t => t.tokenId === token.token_id);
                    if (matchingToken) {
                        matchingToken.name = token.name;
                        if (matchingToken.contractId === '876578') {
                            matchingToken.name += ' (VSR)';
                        }
                        if (token.metadata.avatar) {
                            matchingToken.imageUrl = token.metadata.avatar;
                        }
                    }
                });
            }

            updateDisplayedNfts();
        } catch (err) {
            console.error('Error fetching NFTs:', err);
            error = 'Failed to load NFTs. Please try again later.';
        } finally {
            isLoading = false;
        }
    }

    async function fetchCollectionInfo(contractId: string) {
        try {
            const response = await fetch(
                `https://voi-mainnet-mimirapi.nftnavigator.xyz/nft-indexer/v1/collections?contractId=${contractId}`
            );
            if (!response.ok) return null;
            const data = await response.json();
            return data.collections?.[0] || null;
        } catch (err) {
            console.error('Error fetching collection:', err);
            return null;
        }
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
                case 'tokenId':
                    // Try to parse as numbers if possible for natural sorting
                    const aNum = parseInt(a.tokenId);
                    const bNum = parseInt(b.tokenId);
                    if (!isNaN(aNum) && !isNaN(bNum)) {
                        comparison = aNum - bNum;
                    } else {
                        comparison = a.tokenId.localeCompare(b.tokenId);
                    }
                    break;
                case 'lastSalePrice':
                    const priceA = a.lastSalePrice || 0;
                    const priceB = b.lastSalePrice || 0;
                    comparison = priceA - priceB;
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }

    function toggleSortDirection() {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }

    function updateDisplayedNfts() {
        // First sort filtered NFTs
        const sortedNfts = sortNFTs(filteredNftTokens);
        
        // Calculate total pages
        totalPages = Math.ceil(sortedNfts.length / itemsPerPage);
        
        // Get the slice of NFTs for the current page
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        displayedNftTokens = sortedNfts.slice(startIndex, endIndex);
    }

    $: {
        if (walletAddress) {
            refreshNFTs();
        }
    }

    // Update the displayed NFTs whenever sort options change
    $: {
        if (selectedSort || sortDirection) {
            updateDisplayedNfts();
        }
    }
</script>
        <!-- NFT Tokens Section -->
        <div class="flex flex-col space-y-4 mb-6">
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-4">
                    <h3 class="text-xl font-semibold text-gray-900 dark:text-white">NFT Tokens</h3>
                    <button
                        on:click={refreshNFTs}
                        class="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                        disabled={isLoadingNFTs}
                        title="Refresh NFTs"
                    >
                        <i class="fas fa-sync-alt {isLoadingNFTs ? 'animate-spin' : ''}"></i>
                        <span class="sr-only">Refresh NFTs</span>
                    </button>
                </div>
            </div>

            <!-- Marketplace Links -->
            <div class="flex flex-col sm:flex-row gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div class="flex-1">
                    <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">Looking for NFTs? Check out these marketplaces and resources:</p>
                    <div class="flex gap-2">
                        <a
                            href="https://nautilus.sh"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
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
                        <a 
                            href="https://nftnavigator.xyz/portfolio/{walletAddress}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                        >
                            <img 
                                src="https://nftnavigator.xyz/favicon.ico" 
                                alt="NFT Navigator" 
                                class="w-4 h-4 mr-1.5"
                                on:error={handleIconError}
                            />
                            NFT Navigator
                        </a>
                    </div>
                </div>
            </div>

            <!-- NFT Search and Filters -->
            <div class="flex flex-col sm:flex-row gap-4">
                <div class="flex-1">
                    <input
                        type="text"
                        placeholder="Search by name, ID, or collection..."
                        bind:value={searchQuery}
                        class="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
                    />
                </div>
                <div class="flex items-center gap-2">
                    <select
                        bind:value={selectedCollection}
                        class="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                    >
                        <option value="all">All Collections</option>
                        {#each uniqueCollections as collection}
                            <option value={collection}>{collection}</option>
                        {/each}
                    </select>
                    <select
                        bind:value={selectedSort}
                        class="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                    >
                        {#each sortOptions as option}
                            <option value={option.id}>{option.label}</option>
                        {/each}
                    </select>
                    <button
                        on:click={toggleSortDirection}
                        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
                        title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                    >
                        {#if sortDirection === 'asc'}
                            <i class="fas fa-sort-amount-up-alt"></i>
                        {:else}
                            <i class="fas fa-sort-amount-down"></i>
                        {/if}
                    </button>
                </div>
            </div>

            <div class="flex items-center">
                {#if filteredNftTokens.length !== allNftTokens.length}
                    <span class="ms-auto text-sm text-gray-500 dark:text-gray-400">
                        Showing {filteredNftTokens.length} of {allNftTokens.length} NFTs
                    </span>
                {/if}
            </div>
        </div>

        {#if isLoading && !displayedNftTokens.length}
            <div class="flex justify-center items-center h-32">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            </div>
        {:else if error && !displayedNftTokens.length}
            <div class="text-red-500 dark:text-red-400 text-center py-4">
                {error}
            </div>
        {:else if !displayedNftTokens.length}
            <div class="text-gray-500 dark:text-gray-400 text-center py-4">
                {!filteredNftTokens.length && allNftTokens.length 
                    ? 'No NFTs match your current filters.' 
                    : 'No NFTs found in this wallet.'}
            </div>
        {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {#each displayedNftTokens as nft}
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
                                <p class="text-sm text-gray-500 dark:text-gray-400">Token ID: {nft.tokenId.length > 6 ? nft.tokenId.slice(0, 6) + '...' : nft.tokenId}</p>
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

            {#if totalPages > 1}
                <div class="mt-6 flex justify-center items-center space-x-4">
                    <button
                        class="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        on:click={goToPreviousPage}
                        disabled={currentPage === 1}
                        aria-label="Previous Page"
                    >
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <span class="text-sm text-gray-600 dark:text-gray-400">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        class="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        on:click={goToNextPage}
                        disabled={currentPage === totalPages}
                        aria-label="Next Page"
                    >
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            {/if}
        {/if}