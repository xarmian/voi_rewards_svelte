<script lang="ts">
    import FungibleToken from './FungibleToken.svelte';
    import { onMount } from 'svelte';
    import { algodClient, algodIndexer } from '$lib/utils/algod';
    import { getEnvoiNames } from '$lib/utils/envoi';
    import { dataTable } from '../../stores/dataTable';
    import { getTokensByEpoch, decodeGlobalState } from '$lib/utils';
    import { getSupplyInfo, getConsensusInfo } from '$lib/stores/accounts';
    import { config } from '$lib/config';
    import { voiPrice, fetchVoiPrice } from '$lib/stores/price';
    import CopyComponent from '$lib/component/ui/CopyComponent.svelte';
    import AssetsTable from '../components/AssetsTable.svelte';
	import type { LPToken } from '$lib/types/assets';
	import InfoButton from './ui/InfoButton.svelte';
    import SendTokenModal from './SendTokenModal.svelte';
    import { selectedWallet } from 'avm-wallet-svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { fade } from 'svelte/transition';
    import ConsensusDetails from './ConsensusDetails.svelte';
    import TokenTransfersModal from './TokenTransfersModal.svelte';

    export let walletAddress: string | undefined = undefined;

    type SortOption = {
        id: string;
        label: string;
    };

    const sortOptions: SortOption[] = [
        { id: 'name', label: 'Name' },
        { id: 'collection', label: 'Collection' }
    ];

    const voiEquivalentTokens: string[] = [
        '390001',
        '664258',
        '770561',
        '828295',
        '913147'
    ];

    let selectedSort = sortOptions[0].id;
    let sortDirection: 'asc' | 'desc' = 'asc';
    let accountBalance = 0;
    let accountCreationDate: string | null = null;
    let accountStatus: string = 'Unknown';
    let minBalance: number = 0;
    let pendingRewards: number = 0;
    let totalRewards: number = 0;
    let envoiName: string | null = null;
    let envoiAvatar: string | undefined = undefined;
    let epochData: any[] = [];
    let currentEpochRewards: number = 0;
    let rewardsHistory: any[] = [];
    let asaDetails: any[] = [];
    let canSignTransactions = false;
    let totalValue: number = 0;

    // Add view type state
    let viewType: 'cards' | 'table' = 'cards';

    const rewardsAddress: string[] = [
        '62TIVJSZOS4DRSSYYDDZELQAGFYQC5JWKCHRBPPYKTZN2OOOXTGLB5ZJ4E',
        'CAGQDUFUPI6WAQCIQZHPHMX2Z7KACAKZWOMI4R72JV24U4AVAJTGCHA2BE'
    ];

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

    interface FungibleTokenType {
        id: string;
        name: string;
        symbol: string;
        balance: number;
        decimals: number;
        verified: boolean;
        imageUrl: string;
        value: number;
        poolId?: string;
        type?: 'vsa' | 'arc200';
    }

    interface ASAToken {
        assetId: number;
        amount: number;
        creator: string;
        frozen: boolean;
        name?: string;
        unitName?: string;
        decimals?: number;
        type?: 'vsa' | 'arc200';
    }

    interface Transaction {
        'payment-transaction'?: {
            amount: number;
        };
        sender: string;
        'confirmed-round': number;
    }

    let nftTokens: NFTToken[] = [];
    let isLoading = true;
    let error: string | null = null;
    let currentPage = 1;
    let itemsPerPage = 12;
    let allNftTokens: NFTToken[] = [];
    let displayedNftTokens: NFTToken[] = [];
    let totalPages = 0;
    let collections: Map<string, any> = new Map();
    let poolData: Map<string, any> = new Map();
    let asaTokens: ASAToken[] = [];

    // Placeholder data for fungible tokens
    let fungibleTokens: FungibleTokenType[] = [];

    let showZeroBalances = false;


    // Add these to your existing type definitions and variables
    type TokenSortOption = {
        id: 'name' | 'type' | 'balance' | 'value';
        label: string;
    };

    const tokenSortOptions: TokenSortOption[] = [
        { id: 'value', label: 'Value' },
        { id: 'name', label: 'Name' },
        { id: 'type', label: 'Type' },
        { id: 'balance', label: 'Balance' }
    ];

    let selectedTokenSort: TokenSortOption['id'] = 'value';
    let tokenSortDirection: 'asc' | 'desc' = 'desc';
    let tokenSearchQuery = '';
    let selectedTokenType: 'all' | 'vsa' | 'arc200' = 'all';
    let showSendVoiModal = false;
    let refreshTrigger = 0;

    let lastInitializedWallet: string | undefined;

    let epochsLinkClicked = false;

    let isLoadingPortfolio = false;
    let isLoadingLPTokens = false;
    let isLoadingTokens = false;
    let isLoadingNFTs = false;

    let voteKeyExpiry: number | undefined;
    let voteKeyExpiryDate: Date | undefined;

    let poolShare: number | null = null;

    let showVoiTransfersModal = false;

    interface NomadexPool {
        id: number;
        alphaId: number;
        betaId: number;
        balance: {
            lpt: string | number;
            issuedLpt: string | number;
        };
    }

    interface NomadexPoolInfo {
        id: number;
        alphaId: number;
        betaId: number;
        balances: number[];
        alphaType: string;
        betaType: string;
        apr: number;
    }

    onMount(() => {
        // Initial fetch
        if (walletAddress) {
            //initializePortfolio();
        }
    });

    const LoadingOverlay = ({height = 'h-full'}: {height?: string}) => `
        <div class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-[1px] z-10 flex items-center justify-center ${height}">
            <div class="flex flex-col items-center gap-3">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 dark:border-blue-400"></div>
                <span class="text-sm text-gray-600 dark:text-gray-300">Refreshing...</span>
            </div>
        </div>
    `;

    async function handleEpochsClick(event: MouseEvent) {
        event.preventDefault();
        const targetPath = `/wallet/${walletAddress}`;
        
        // If we're already on the wallet page, just update the hash
        if ($page.url.pathname === targetPath) {
            window.location.hash = 'epochs';
            // Ensure the epochs section is scrolled into view
            document.getElementById('epochs')?.scrollIntoView({ behavior: 'smooth' });
        } else {
            // Navigate to the wallet page with the epochs hash
            await goto(`${targetPath}#epochs`);
        }
    }

    function handleTokenSent() {
        refreshPortfolio();
        refreshTokens();
    }

    $: {
        if (walletAddress && walletAddress !== lastInitializedWallet) {
            lastInitializedWallet = walletAddress;
            canSignTransactions = $selectedWallet?.address === walletAddress && $selectedWallet?.app !== '' && $selectedWallet?.app !== 'Watch';
            initializePortfolio();
        }
    }

    async function refreshPortfolio() {
        isLoadingPortfolio = true;
        try {
            await Promise.all([
                fetchAccountDetails(),
                fetchVoiPrice()
            ]);
            
            // Recalculate total value
            totalValue = fungibleTokens.reduce((acc, token) => acc + token.value, 0) +
                        nftTokens.reduce((acc, nft) => acc + (nft.lastSalePrice || 0), 0) +
                        asaDetails.reduce((acc, asa) => acc + (asa.value || 0), 0) +
                        (accountBalance / 1e6);
        } catch (error) {
            console.error('Error refreshing portfolio:', error);
        } finally {
            isLoadingPortfolio = false;
        }
    }

    async function refreshTokens() {
        isLoadingTokens = true;
        isLoadingLPTokens = true;
        try {
            await fetchPoolData();
            await Promise.all([
                fetchFungibleTokens(),
                fetchNomadexLPTokens()
            ]);
        } catch (error) {
            console.error('Error refreshing tokens:', error);
        } finally {
            isLoadingTokens = false;
            isLoadingLPTokens = false;
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

    async function initializePortfolio() {
        try {
            await Promise.all([
                refreshPortfolio(),
                refreshTokens(),
                refreshNFTs()
            ]);
        } catch (error) {
            console.error('Error initializing portfolio:', error);
        }
    }

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

    async function fetchRewardsHistory() {
        if (!walletAddress) return [];
        
        try {
            // Fetch all rewards transactions
            const rewardsPromises = rewardsAddress.map(address => 
                algodIndexer
                    .searchForTransactions()
                    .address(walletAddress)
                    .addressRole('receiver')
                    .beforeTime(new Date().toISOString())
                    .do()
                    .then(response => response.transactions.filter((tx: { sender: string }) => tx.sender === address))
            );

            const allTransactions = await Promise.all(rewardsPromises);
            return allTransactions.flat() as Transaction[];
        } catch (err) {
            console.error('Error fetching rewards history:', err);
            return [];
        }
    }

    async function fetchAccountDetails() {
        if (!walletAddress) return;
        
        try {
            // Fetch account information
            const accountIndexerInfo = await algodIndexer.lookupAccountByID(walletAddress).do();
            const account = await algodClient.accountInformation(walletAddress).do();
            accountBalance = accountIndexerInfo.account.amount;
            accountStatus = accountIndexerInfo.account.status || 'Offline';
            minBalance = accountIndexerInfo.account['min-balance'] || 0;
            
            // Calculate pending rewards
            pendingRewards = accountIndexerInfo.account.rewards || 0;
            
            // Calculate vote key expiry if account is online
            if (accountStatus === 'Online' && account.participation) {
                const currentRound = account.round;
                const lastValidRound = account.participation['vote-last-valid'];
                voteKeyExpiry = (lastValidRound - currentRound) * 3.3; // 3.3 seconds per block
                voteKeyExpiryDate = new Date(Date.now() + voteKeyExpiry * 1000);
            }
            
            // Fetch ASA tokens
            asaTokens = (accountIndexerInfo.account.assets || []).map((asset: any) => ({
                assetId: asset['asset-id'],
                amount: asset.amount,
                creator: asset.creator,
                frozen: asset['is-frozen'],
            }));

            // Fetch ASA token details
            asaDetails = await Promise.all(
                asaTokens.map(async (asa) => {
                    const details = await algodClient.getAssetByID(asa.assetId).do();
                    const value = (details.params.creator === walletAddress ? details.params.total - asa.amount : asa.amount) / Math.pow(10, details.params.decimals);
                    return {
                        id: asa.assetId,
                        creator: asa.creator,
                        frozen: asa.frozen,
                        name: details.params.name ?? (Buffer.from(details.params['name-b64'], 'base64').toString('utf8') ?? ''),
                        unitName: details.params['unit-name'] ?? (Buffer.from(details.params['unit-name-b64'], 'base64').toString('utf8') ?? ''),
                        decimals: details.params.decimals,
                        value: (asa.assetId === 302190 ? value / $voiPrice.price : 0),
                        poolId: (asa.assetId === 302190 ? 395553 : undefined),
                        amount: (details.params.creator === walletAddress ? details.params.total - asa.amount : asa.amount)
                    };
                })
            );

            const block = await algodIndexer.lookupBlock(accountIndexerInfo.account['created-at-round']).do();
            accountCreationDate = new Date(block.timestamp * 1000).toLocaleDateString();

            // Fetch Envoi name
            try {
                const envoiResults = await getEnvoiNames([walletAddress]);
                envoiName = envoiResults.length > 0 ? envoiResults[0].name : null;
                envoiAvatar = envoiResults.length > 0 ? envoiResults[0].metadata.avatar : undefined;
            } catch (err) {
                console.error('Error fetching Envoi name:', err);
            }

            // Calculate rewards using epoch data
            try {
                const dates = await dataTable.fetchDateRanges();
                const epochSummary = await fetch(`${config.proposalApiBaseUrl}?action=epoch-summary&wallet=${walletAddress}`).then(r => r.json());
                const [supplyData] = await Promise.all([getSupplyInfo()]);

                if (!supplyData) {
                    throw new Error('Failed to fetch supply data');
                }

                const epochPromises = dates.map(async (date: any) => {
                    const [startStr] = date.id.split('-');
                    const formattedDate = `${startStr.slice(0,4)}-${startStr.slice(4,6)}-${startStr.slice(6,8)}T00:00:00Z`;
                    const snapshots = epochSummary.snapshots ? epochSummary.snapshots : epochSummary;

                    const epochData = snapshots.find((e: any) => e.start_date === formattedDate);
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

                epochData = (await Promise.all(epochPromises)).filter((data): data is NonNullable<typeof data> => data !== null);
                
                // Calculate current epoch rewards
                const now = new Date();
                const currentEpoch = epochData.find(epoch => 
                    now >= epoch.startDate && now <= epoch.endDate
                );
                currentEpochRewards = currentEpoch?.expectedReward ?? 0;

                // Fetch and calculate total historical rewards
                rewardsHistory = await fetchRewardsHistory();
                totalRewards = rewardsHistory.reduce((sum, tx: Transaction) => {
                    if (tx['confirmed-round'] < 1520000) return sum;
                    if (tx['payment-transaction']) {
                        return sum + tx['payment-transaction'].amount;
                    }
                    return sum;
                }, 0);
            } catch (err) {
                console.error('Error calculating rewards:', err);
            }
        } catch (err) {
            console.error('Error fetching account details:', err);
            error = 'Failed to load some account details';
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

    async function fetchCollectionInfo(contractId: string) {
        try {
            const response = await fetch(
                `https://arc72-voi-mainnet.nftnavigator.xyz/nft-indexer/v1/collections?contractId=${contractId}`
            );
            if (!response.ok) return null;
            const data = await response.json();
            return data.collections?.[0] || null;
        } catch (err) {
            console.error('Error fetching collection:', err);
            return null;
        }
    }

    async function fetchPoolData() {
        try {
            const response = await fetch('https://mainnet-idx.nautilus.sh/nft-indexer/v1/dex/pools?tokenId=390001');
            if (!response.ok) throw new Error('Failed to fetch pool data');
            const data = await response.json();
            
            // Store pool data by pool contractId
            data.pools.forEach((pool: any) => {
                // Skip deleted pools
                if (pool.deleted) return;
                
                // Store pool by its contractId
                poolData.set(pool.contractId.toString(), pool);
            });
        } catch (err) {
            console.error('Error fetching pool data:', err);
        }
    }

    function calculateTokenValue(token: any, pool: any): number {
        if (voiEquivalentTokens.includes(String(token.contractId))) {
            return Number(token.balance / 1e6);
        }

        if (!pool) return 0;

        try {
            // Get pool balances based on whether VOI is token A or B
            const voiBalance = pool.isVoiA ? pool.poolBalA : pool.poolBalB;
            const tokenBalance = pool.isVoiA ? pool.poolBalB : pool.poolBalA;
            
            if (tokenBalance === '0' || voiBalance === '0') return 0;

            // Calculate price in VOI
            const priceInVoi = Number(voiBalance) / Number(tokenBalance);
            
            // Calculate value based on user's token balance and decimals
            const userBalance = token.balance / (10 ** token.decimals);
            return userBalance * priceInVoi;
        } catch (err) {
            console.error('Error calculating token value:', err);
            return 0;
        }
    }

    async function fetchFungibleTokens() {
        if (!walletAddress) return;
        
        isLoading = true;
        error = null;
        try {
            // Ensure we have pool data first
            if (poolData.size === 0) {
                await fetchPoolData();
            }

            const url = new URL('https://mainnet-idx.nautilus.sh/nft-indexer/v1/arc200/balances');
            url.searchParams.append('accountId', walletAddress);
            const response = await fetch(url.toString());
            if (!response.ok) throw new Error('Failed to fetch fungible tokens');
            const data = await response.json();
            
            fungibleTokens = data.balances.map((token: any) => {
                const tokenId = token.contractId.toString();
                // Check if this token is a pool token by looking up its contractId in poolData
                const pool = poolData.get(tokenId);
                
                if (pool) {
                    // This is an LP token
                    return {
                        name: `${pool.symbolA}/${pool.symbolB} LP`,
                        symbol: `${pool.symbolA}/${pool.symbolB}`,
                        balance: token.balance,
                        decimals: token.decimals,
                        verified: token.verified,
                        imageUrl: `https://asset-verification.nautilus.sh/icons/${tokenId}.png`,
                        id: tokenId,
                        poolId: pool.contractId.toString(),
                        value: Number(pool.tvl * (Number(token.balance / Math.pow(10, token.decimals)) / Number(pool.supply))),
                        poolInfo: {
                            tokAId: pool.tokAId,
                            tokBId: pool.tokBId,
                            tokASymbol: pool.symbolA,
                            tokBSymbol: pool.symbolB,
                            tokABalance: pool.poolBalA,
                            tokBBalance: pool.poolBalB,
                            totalSupply: pool.supply * Math.pow(10, 6),
                            poolId: pool.contractId.toString(),
                            apr: pool.apr,
                            tokADecimals: pool.tokADecimals,
                            tokBDecimals: pool.tokBDecimals,
                            tvl: pool.tvl,
                            provider: 'humble'
                        }
                    };
                }

                // Regular fungible token
                // Find if this token is in any pool for trading
                const poolForToken = Array.from(poolData.values()).find(p => 
                    p.tokAId === tokenId || p.tokBId === tokenId
                );
                
                return {
                    name: token.symbol,
                    symbol: token.symbol,
                    balance: token.balance,
                    decimals: token.decimals,
                    verified: token.verified,
                    imageUrl: `https://asset-verification.nautilus.sh/icons/${tokenId}.png`,
                    value: calculateTokenValue(token, poolForToken),
                    id: tokenId,
                    poolId: poolForToken?.contractId?.toString(),
                    type: 'arc200'
                };
            });
        } catch (err) {
            console.error('Error fetching fungible tokens:', err);
        } finally {
            isLoading = false;
        }
    }

    async function fetchNFTs() {
        if (!walletAddress) return;
        
        isLoading = true;
        error = null;
        try {
            const url = new URL('https://arc72-voi-mainnet.nftnavigator.xyz/nft-indexer/v1/tokens');
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
                            console.error('Error parsing metadata JSON:', e);
                        }
                    }

                    const finalMetadata = parsedMetadata || {};
                    const collection = collections.get(token.contractId.toString());

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
            });

            updateDisplayedNfts();
        } catch (err) {
            console.error('Error fetching NFTs:', err);
            error = 'Failed to load NFTs. Please try again later.';
        } finally {
            isLoading = false;
        }
    }

    function updateDisplayedNfts() {
        // First sort all NFTs
        const sortedNfts = sortNFTs(allNftTokens);
        
        // Calculate total pages
        totalPages = Math.ceil(sortedNfts.length / itemsPerPage);
        
        // Get the slice of NFTs for the current page
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        displayedNftTokens = sortedNfts.slice(startIndex, endIndex);
    }

    async function loadMore() {
        if (currentPage < totalPages) {
            currentPage++;
            updateDisplayedNfts();
        }
    }

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            updateDisplayedNfts();
        }
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

    // Update the displayed NFTs whenever sort options change
    $: {
        if (selectedSort || sortDirection) {
            updateDisplayedNfts();
        }
    }

    async function fetchNomadexLPTokens() {
        if (!walletAddress) return;
        
        try {
            // Get all Nomadex pools
            const pools = await fetch(`https://api.voirewards.com/nomadex/index.php`);
            const poolData = (await pools.json()) as NomadexPoolInfo[];

            // Extract unique token IDs from pools (excluding 0 which is VOI)
            const uniqueTokenIds = [...new Set(poolData.flatMap(pool => [pool.alphaId, pool.betaId]))].filter(id => id !== 0);

            // Create a map to store token details
            const tokenDetails = new Map();
            
            // Add VOI token details manually
            tokenDetails.set(0, {
                name: 'Voi',
                symbol: 'VOI',
                decimals: 6
            });

            // Fetch token details for all unique tokens in parallel
            const tokenPromises = uniqueTokenIds.map(async tokenId => {
                try {
                    const response = await fetch(`https://mainnet-idx.nautilus.sh/nft-indexer/v1/arc200/tokens?contractId=${tokenId}`);
                    if (!response.ok) return null;
                    const data = await response.json();
                    const token = data.tokens[0];
                    if (token) {
                        tokenDetails.set(tokenId, {
                            name: token.name,
                            symbol: token.symbol,
                            decimals: token.decimals
                        });
                    }
                } catch (err) {
                    console.error(`Error fetching token details for ${tokenId}:`, err);
                }
            });

            // Wait for all token details to be fetched
            await Promise.all(tokenPromises);

            // Call Nomadex endpoint with the user's wallet address
            const response = await fetch(`https://voimain-analytics.nomadex.app/pools/${walletAddress}`);
            if (!response.ok) {
                console.error('Failed to fetch Nomadex LP tokens');
                return;
            }
            const data = await response.json();
            
            // Map through each pool returned by Nomadex
            const nomadexLPTokens = await Promise.all(data.map(async (pool: NomadexPool) => {
                // get global state using algodClient
                const ctc = await algodClient.getApplicationByID(pool.id).do();
                const globalState = decodeGlobalState(ctc.params['global-state']);

                const decimals = Number(globalState.find((state: any) => state.key === 'decimals')?.value);
                const name = globalState.find((state: any) => state.key === 'name')?.value;

                const lpt = Number(pool.balance.lpt);
                const issuedLpt = Number(pool.balance.issuedLpt);
                
                // find pool in poolData
                const poolInfo = poolData.find((p: any) => p.id === pool.id);
                if (!poolInfo) {
                    console.error(`Pool info not found for pool ${pool.id}`);
                    return null;
                }

                let tvl = 0;
                
                // Calculate TVL based on token prices
                if (poolInfo.alphaId === 0) {
                    tvl = poolInfo.balances[0] * 2;
                } else if (poolInfo.betaId === 0) {
                    tvl = poolInfo.balances[1] * 2;
                } else {
                    // For non-VOI pairs, we would need price data to calculate TVL accurately
                    // For now, we'll leave it as 0
                    tvl = 0;
                }

                // Get token details for both tokens in the pool
                const tokenA = tokenDetails.get(pool.alphaId) || { name: `Token ${pool.alphaId}`, symbol: `${pool.alphaId}`, decimals: 6 };
                const tokenB = tokenDetails.get(pool.betaId) || { name: `Token ${pool.betaId}`, symbol: `${pool.betaId}`, decimals: 6 };

                return {
                    name: name,
                    symbol: `${tokenA.symbol}/${tokenB.symbol}`,
                    balance: lpt,
                    decimals: decimals,
                    verified: true,
                    imageUrl: `https://asset-verification.nautilus.sh/icons/0.png`,
                    id: pool.id,
                    poolId: String(pool.id),
                    value: lpt / issuedLpt * tvl / Math.pow(10, 6),
                    poolInfo: {
                        tokAId: pool.alphaId,
                        tokBId: pool.betaId,
                        tokASymbol: tokenA.symbol,
                        tokBSymbol: tokenB.symbol,
                        tokABalance: poolInfo.balances[0],
                        tokBBalance: poolInfo.balances[1],
                        tokAType: poolInfo.alphaType,
                        tokBType: poolInfo.betaType,
                        tokADecimals: tokenA.decimals,
                        tokBDecimals: tokenB.decimals,
                        totalSupply: issuedLpt,
                        poolId: String(pool.id),
                        apr: Math.round(poolInfo.apr * 100) / 100,
                        tvl: tvl,
                        provider: 'nomadex'
                    }
                }
            }));

            // Filter out null values and append the Nomadex LP tokens to our existing fungibleTokens array
            fungibleTokens = [
                ...fungibleTokens,
                ...nomadexLPTokens.filter((token): token is NonNullable<typeof token> => token !== null)
            ];
        } catch (err) {
            console.error('Error fetching Nomadex LP tokens:', err);
        }
    }

    function getOptimizedImageUrl(imageUrl: string, metadataURI: string | undefined, width = 200): string {
        if (!imageUrl) return "https://placehold.co/100x100";
        
        // Check if it's a Highforge CDN URL
        if (imageUrl.includes('highforge.io')) {
            if (metadataURI) {
                return `https://prod.cdn.highforge.io/i/${encodeURIComponent(metadataURI)}?w=${width}`;
            }
        }
        else if (imageUrl && imageUrl.includes('ipfs://')) {
            return imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
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

    function getTokenType(token: any): 'vsa' | 'arc200' {
        return 'assetId' in token ? 'vsa' : 'arc200';
    }

    function sortTokens(tokens: any[]): any[] {
        return [...tokens].sort((a, b) => {
            const aDetails = asaDetails.find(d => d.id === a.assetId);
            const bDetails = asaDetails.find(d => d.id === b.assetId);
            
            let comparison = 0;
            switch (selectedTokenSort) {
                case 'name':
                    const aName = aDetails?.name || a.name || '';
                    const bName = bDetails?.name || b.name || '';
                    comparison = aName.localeCompare(bName);
                    break;
                case 'type':
                    comparison = getTokenType(a).localeCompare(getTokenType(b));
                    break;
                case 'balance':
                    const aBalance = (aDetails?.amount || a.balance || 0) / Math.pow(10, aDetails?.decimals || a.decimals || 0);
                    const bBalance = (bDetails?.amount || b.balance || 0) / Math.pow(10, bDetails?.decimals || b.decimals || 0);
                    comparison = aBalance - bBalance;
                    break;
                case 'value':
                    const aValue = aDetails?.value || a.value || 0;
                    const bValue = bDetails?.value || b.value || 0;
                    comparison = aValue - bValue;
                    break;
            }
            return tokenSortDirection === 'asc' ? comparison : -comparison;
        });
    }

    function filterTokens(tokens: any[]): any[] {
        return tokens.filter(token => {
            const details = asaDetails.find(d => d.id === token.assetId);
            const name = (details?.name || token.name || '').toLowerCase();
            const id = (details?.id || token.id || '').toString();
            const type = getTokenType(token);
            
            // Type filter
            if (selectedTokenType !== 'all' && type !== selectedTokenType) {
                return false;
            }
            
            // Search query filter
            if (tokenSearchQuery) {
                const query = tokenSearchQuery.toLowerCase();
                return name.includes(query) || id.includes(query);
            }
            
            return true;
        });
    }

	function isLPToken(token: FungibleTokenType | LPToken) {
		return 'poolInfo' in token && token.poolInfo !== undefined;
	}
</script>

<div class="space-y-6">
    <!-- Portfolio Overview with View Toggle -->
    <div class="flex items-center justify-between">
        <div class="flex items-center space-x-4">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Portfolio Overview</h2>
            <button
                on:click={refreshPortfolio}
                class="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                disabled={isLoadingPortfolio}
                title="Refresh portfolio overview"
            >
                <i class="fas fa-sync-alt {isLoadingPortfolio ? 'animate-spin' : ''}"></i>
                <span class="sr-only">Refresh portfolio overview</span>
            </button>
            <div class="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1 hidden">
                <button
                    class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {viewType === 'cards' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}"
                    on:click={() => viewType = 'cards'}
                >
                    <i class="fas fa-th-large mr-1.5"></i>
                    Cards
                </button>
                <button
                    class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {viewType === 'table' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}"
                    on:click={() => viewType = 'table'}
                >
                    <i class="fas fa-table mr-1.5"></i>
                    Table
                </button>
            </div>
        </div>
        <div class="text-right">
            <p class="text-sm text-gray-500 dark:text-gray-400">Total Value</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{totalValue.toLocaleString()} VOI</p>
            <p class="text-sm font-bold text-gray-900 dark:text-white">${(totalValue * $voiPrice.price).toLocaleString()} USD</p>
        </div>
    </div>

    <!-- User's Account Info -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-3 md:p-6 relative">
        {#if isLoadingPortfolio}
            <div transition:fade={{ duration: 150 }}>
                {@html LoadingOverlay({})}
            </div>
        {/if}
        <div class="flex flex-col space-y-6">
            <!-- Header with Address -->
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 dark:border-gray-700 pb-4" style="place-items: flex-start;">
                <div class="flex-1">
                    <div class="flex items-center space-x-4 mb-2">
                        <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Account Overview</h3>
                        <button
                            on:click={refreshPortfolio}
                            class="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            disabled={isLoadingPortfolio}
                            title="Refresh account overview"
                        >
                            <i class="fas fa-sync-alt {isLoadingPortfolio ? 'animate-spin' : ''}"></i>
                            <span class="sr-only">Refresh account overview</span>
                        </button>
                    </div>
                    <div class="flex items-center gap-2 mb-2">
                        <div class="flex items-center gap-2">
                            {#if envoiAvatar}
                                <a href={`https://app.envoi.sh/#/${envoiName}`} target="_blank" rel="noopener noreferrer">
                                    <img 
                                        src={envoiAvatar} 
                                        alt="Profile Avatar" 
                                        class="w-16 h-16 rounded-full object-cover"
                                        on:error={(e) => {
                                            const img = e.target as HTMLImageElement;
                                            img.src = "/icons/default-avatar.png";
                                        }}
                                    />
                                </a>
                            {/if}
                        </div>
                        <div class="flex flex-col gap-2">
                            <div class="flex items-center gap-2 mb-2">
                                <div class="flex items-center gap-2">
                                    <span class="hidden md:block font-mono text-sm text-gray-600 dark:text-gray-300">{walletAddress}</span>
                                    <span class="block md:hidden font-mono text-sm text-gray-600 dark:text-gray-300">{walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}</span>
                                    <CopyComponent text={walletAddress} />
                                </div>
                                {#if envoiName}
                                    <a class="text-purple-600 dark:text-purple-400" href={`https://app.envoi.sh/#/${envoiName}`} target="_blank" rel="noopener noreferrer">
                                        <span >({envoiName})</span>
                                    </a>
                                {/if}
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <a 
                                    href={`https://voiager.xyz/account/${walletAddress}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full transition-colors"
                                >
                                    Voiager
                                    <i class="fas fa-external-link-alt ml-1"></i>
                                </a>
                                <a 
                                    href={`https://explorer.voi.network/explorer/account/${walletAddress}/transactions`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full transition-colors"
                                >
                                    Voi Explorer
                                    <i class="fas fa-external-link-alt ml-1"></i>
                                </a>
                                <a 
                                    href={`https://block.voi.network/explorer/account/${walletAddress}/transactions`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full transition-colors"
                                >
                                    Block Explorer
                                    <i class="fas fa-external-link-alt ml-1"></i>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mt-4 md:mt-0 text-right place-self-end sm:place-self-start">
                    {#if walletAddress && accountStatus}
                        <ConsensusDetails
                            {walletAddress}
                            {accountStatus}
                            {accountBalance}
                            {voteKeyExpiry}
                            {voteKeyExpiryDate}
                            autoRefresh={true}
                            refreshInterval={10000}
                        />
                    {/if}
                </div>
            </div>

            <!-- Balance and Rewards Info -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <!-- Balance Section -->
                <div class="space-y-4">
                    <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Balance Details</h4>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center">
                            <span class="text-gray-600 dark:text-gray-300">Available Balance</span>
                            <div class="flex items-center gap-3">
                                <span class="text-lg font-semibold text-gray-900 dark:text-white">
                                    {(accountBalance / 1e6).toLocaleString()} VOI
                                </span>
                                <div class="flex items-center gap-2">
                                    <button
                                        on:click={() => showSendVoiModal = true}
                                        class="px-3 py-1 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors {canSignTransactions ? '' : 'opacity-50 cursor-not-allowed'}"
                                        title={canSignTransactions ? 'Send VOI' : 'Connect wallet to send VOI'}
                                    >
                                        <i class="fas fa-paper-plane mr-1"></i>
                                        Send
                                    </button>
                                    <button
                                        on:click={() => showVoiTransfersModal = true}
                                        class="px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-1"
                                        title="View VOI transaction history"
                                    >
                                        <i class="fas fa-clock-rotate-left"></i>
                                        History
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-gray-600 dark:text-gray-300">Minimum Balance</span>
                            <span class="text-sm text-gray-500 dark:text-gray-400">
                                {(minBalance / 1e6).toLocaleString()} VOI
                            </span>
                        </div>
                        {#if accountCreationDate}
                            <div class="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-700">
                                <span class="text-gray-600 dark:text-gray-300">Account Created</span>
                                <span class="text-sm text-gray-500 dark:text-gray-400">{accountCreationDate}</span>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Rewards Section -->
                <div class="space-y-4">
                    <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rewards Overview</h4>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center">
                            <span class="text-gray-600 dark:text-gray-300">Total Earned</span>
                            <span class="text-lg font-semibold text-gray-900 dark:text-white">
                                {(totalRewards / 1e6).toLocaleString()} VOI
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-gray-600 dark:text-gray-300">Current Epoch</span>
                            <span class="text-sm text-gray-900 dark:text-white">
                                {(pendingRewards / 1e6 + currentEpochRewards).toLocaleString()} VOI
                            </span>
                        </div>
                        <div class="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-700">
                            <span class="text-gray-600 dark:text-gray-300">Total Reward Transactions</span>
                            <a 
                                href={`/wallet/${walletAddress}#epochs`}
                                on:click={handleEpochsClick}
                                class="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                            >
                                {rewardsHistory.length}
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- LP Tokens Section -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-3 md:p-6 relative">
        <div class="flex items-center justify-between mb-4">
            <div class="flex items-center space-x-4">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white">LP Tokens</h3>
                <button
                    on:click={refreshTokens}
                    class="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    disabled={isLoadingLPTokens}
                    title="Refresh LP tokens"
                >
                    <i class="fas fa-sync-alt {isLoadingLPTokens ? 'animate-spin' : ''}"></i>
                    <span class="sr-only">Refresh LP tokens</span>
                </button>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-3 gap-4">
            {#if isLoadingLPTokens}
                <div class="col-span-3 flex justify-center items-center py-8">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            {:else}
                {#each fungibleTokens.filter(token => {
                    // Only show tokens with balance if showZeroBalances is false
                    if (!showZeroBalances && token.value <= 1) return false;
                    // Must be an LP token
                    if (!isLPToken(token)) return false;
                    // Get unique identifier based on token ID and provider
                    const uniqueId = `${token.id}-${token.poolInfo?.provider}`;
                    // Check if this is the first occurrence of this unique ID
                    return fungibleTokens.findIndex(t => 
                        isLPToken(t) && 
                        `${t.id}-${t.poolInfo?.provider}` === uniqueId
                    ) === fungibleTokens.indexOf(token);
                }) as token (`lp-${token.id}-${token.poolInfo?.provider}`)}
                    <FungibleToken {token} voiPrice={$voiPrice.price} 
                        on:tokenOptedOut={initializePortfolio}
                        on:tokenSent={initializePortfolio}
                        canSignTransactions={canSignTransactions}
                        walletId={walletAddress}
                    />
                {/each}
                {#if fungibleTokens.filter(token => isLPToken(token) && (showZeroBalances || token.balance > 0)).length === 0}
                    <div class="text-gray-500 dark:text-gray-400 text-center py-4">
                        No LP tokens found in this account.
                    </div>
                {/if}
            {/if}
        </div>
    </div>

    <!-- Fungible Tokens Section -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-3 md:p-6 relative">
        <div class="flex flex-col space-y-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-4">
                    <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
                        Tokens
                        <span class="text-sm text-gray-500 dark:text-gray-400">
                            (VSA & ARC-200 Tokens)
                        </span>
                    </h3>
                    <button
                        on:click={refreshTokens}
                        class="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                        disabled={isLoadingTokens}
                        title="Refresh tokens"
                    >
                        <i class="fas fa-sync-alt {isLoadingTokens ? 'animate-spin' : ''}"></i>
                        <span class="sr-only">Refresh tokens</span>
                    </button>
                </div>
                <label class="inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        bind:checked={showZeroBalances} 
                        class="sr-only peer"
                    >
                    <div class="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">Show Dust</span>
                </label>
            </div>

            <!-- Token Search and Filters -->
            <div class="flex flex-col sm:flex-row gap-4">
                <div class="flex-1">
                    <input
                        type="text"
                        placeholder="Search by name or ID..."
                        bind:value={tokenSearchQuery}
                        class="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
                    />
                </div>
                <div class="flex items-center gap-2">
                    <select
                        bind:value={selectedTokenType}
                        class="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                    >
                        <option value="all">All Types</option>
                        <option value="vsa">VSA</option>
                        <option value="arc200">ARC-200</option>
                    </select>
                    <select
                        bind:value={selectedTokenSort}
                        class="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                    >
                        {#each tokenSortOptions as option}
                            <option value={option.id}>{option.label}</option>
                        {/each}
                    </select>
                    <button
                        on:click={() => tokenSortDirection = tokenSortDirection === 'asc' ? 'desc' : 'asc'}
                        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
                    >
                        {#if tokenSortDirection === 'asc'}
                            <i class="fas fa-sort-amount-up-alt"></i>
                        {:else}
                            <i class="fas fa-sort-amount-down"></i>
                        {/if}
                    </button>
                </div>
            </div>
        </div>

        <!-- Combined Tokens Grid -->
        <div class="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
            {#if isLoadingTokens}
                <div class="col-span-3 flex justify-center items-center py-8">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            {:else}
                {#each sortTokens(filterTokens([
                    ...asaTokens.map(t => ({ ...t, tokenType: 'vsa' as const })),
                    ...fungibleTokens
                        .filter(t => !isLPToken(t) && t.balance > 0)
                        .map(t => ({ ...t, tokenType: 'arc200' as const }))
                ].filter((t, i, arr) => {
                    // Get unique identifier based on token type and ID
                    const getUniqueId = (token: any) => {
                        if (token.tokenType === 'vsa') {
                            return `vsa-${token.assetId}`;
                        } else {
                            // For ARC-200 tokens, use their contract ID
                            return `arc200-${token.id}`;
                        }
                    };
                    const currentUniqueId = getUniqueId(t);
                    // Check if this unique ID appears earlier in the array
                    return !arr.slice(0, i).some(item => getUniqueId(item) === currentUniqueId);
                }))) as token (token.tokenType === 'vsa' ? `vsa-${token.assetId}` : `arc200-${token.id}`)}
                    {@const details = 'assetId' in token ? asaDetails.find(d => d.id === token.assetId) : null}
                    {#if showZeroBalances || (details ? (details?.value ? details?.value > 0.1 : details?.amount / Math.pow(10, details?.decimals || 0) > 0.01) : (token?.value ? token?.value > 0.1 : token?.balance / Math.pow(10, token?.decimals || 0) > 0.01))}
                        <div class="relative min-w-80">
                            <span class="absolute z-10 top-2 right-2 px-2 py-0.5 text-xs font-medium {details ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'} rounded-full">
                                {details ? 'VSA' : 'ARC-200'}
                            </span>
                            <FungibleToken 
                                token={details ? {
                                    id: details.id.toString(),
                                    name: details.name || `Token #${token.assetId}`,
                                    symbol: details.unitName || details.name || `#${token.assetId}`,
                                    balance: details.amount || 0,
                                    decimals: details.decimals || 0,
                                    verified: true,
                                    imageUrl: `https://asset-verification.nautilus.sh/icons/${token.assetId}.png`,
                                    value: details.value || 0,
                                    poolId: details.poolId,
                                    type: (details ? 'vsa' : 'arc200')
                                } : token} 
                                voiPrice={$voiPrice.price}
                                on:tokenOptedOut={initializePortfolio}
                                on:tokenSent={initializePortfolio}
                                canSignTransactions={canSignTransactions}
                                walletId={walletAddress}
                            />
                        </div>
                    {/if}
                {/each}

                {#if filterTokens([...asaTokens, ...fungibleTokens.filter(t => !isLPToken(t))]).length === 0}
                    <div class="text-gray-500 dark:text-gray-400 text-center py-4 col-span-3">
                        No tokens found matching your criteria.
                    </div>
                {/if}
            {/if}
        </div>
    </div>

    {#if viewType === 'cards'}
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-3 md:p-6 relative">
            {#if isLoadingNFTs}
                <div transition:fade={{ duration: 150 }}>
                    {@html LoadingOverlay({})}
                </div>
            {/if}
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
                    No NFTs found in this wallet.
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
        </div>
    {/if}

    <!-- Send VOI Modal -->
    <SendTokenModal
        bind:open={showSendVoiModal}
        token={{
            type: 'native',
            symbol: 'VOI',
            decimals: 6,
            balance: accountBalance,
            name: 'Voi'
        }}
        onTokenSent={handleTokenSent}
    />

    <!-- VOI Transfers Modal -->
    {#if typeof walletAddress === 'string' && showVoiTransfersModal}
        <TokenTransfersModal
            bind:open={showVoiTransfersModal}
            token={{
                id: '0',
                type: 'native',
                symbol: 'VOI',
                decimals: 6,
                balance: accountBalance,
                name: 'Voi',
                verified: true,
                imageUrl: '/icons/voi_icon.png',
                value: accountBalance / 1e6
            }}
            walletId={walletAddress}
        />
    {/if}
</div> 