<script lang="ts">
    import type { FungibleTokenType, LPToken, TokenApproval } from '$lib/types/assets';
    import { createEventDispatcher } from 'svelte';
    import SendTokenModal from './SendTokenModal.svelte';
    import OptOutModal from './OptOutModal.svelte';
    import TokenTransfersModal from './TokenTransfersModal.svelte';
    import ManageApprovalsModal from './ManageApprovalsModal.svelte';
    import { getEnvoiNames } from '$lib/utils/envoi';
    import { algodClient } from '$lib/utils/algod';
    import { selectedWallet } from 'avm-wallet-svelte';
    import algosdk from 'algosdk';
    import { arc200TransferFrom } from '$lib/utils/arc200';
    import { signTransactions } from 'avm-wallet-svelte';

    const dispatch = createEventDispatcher();

    export let token: FungibleTokenType | LPToken;
    export let canSignTransactions = false;
    export let walletId: string | undefined;
    export let fungibleTokens: FungibleTokenType[];
    let showOptOutModal = false;
    let showSendModal = false;
    let showTransfersModal = false;
    let showManageApprovalsModal = false;
    let isExpanded = false;
    let creatorEnvoiName: string | null = null;
    let totalSupply: number | null = null;
    let creator: string | null = null;
    let tokenImages = new Map<string, string>();
    let failedTokenImages = new Set<string>();
    let claimingApproval: string | null = null;
    let claimingError: string | null = null;
    let claimSuccess: boolean = false;
    let claimTxId: string | null = null;

    function onImageError(event: Event) {
        const img = event.target as HTMLImageElement;
        if (!img) return;
        
        const tokenId = img.dataset.tokenId;
        if (!tokenId) return;
        
        // Add to failed set
        failedTokenImages.add(tokenId);
        
        // Immediately set the fallback image
        img.src = '/icons/default-token-image.svg';
    }

    async function cacheTokenImage(tokenId: string) {
        if (!tokenId || tokenImages.has(tokenId) || failedTokenImages.has(tokenId)) return;
        
        try {
            const response = await fetch(`https://asset-verification.nautilus.sh/icons/${tokenId}.png`);
            if (!response.ok) {
                failedTokenImages.add(tokenId);
                return;
            }
            
            const blob = await response.blob();
            const img = new Image();
            
            img.onerror = () => {
                failedTokenImages.add(tokenId);
            };
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    failedTokenImages.add(tokenId);
                    return;
                }

                // Draw the image
                ctx.drawImage(img, 0, 0);

                // Get the image data
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // Convert white (or near-white) pixels to transparent
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    
                    // Check if the pixel is white or very close to white
                    if (r > 250 && g > 250 && b > 250) {
                        // Make it transparent
                        data[i + 3] = 0;
                    }
                }

                // Put the modified image data back
                ctx.putImageData(imageData, 0, 0);

                // Convert to base64
                const base64 = canvas.toDataURL('image/png');
                tokenImages.set(tokenId, base64);
                tokenImages = tokenImages; // Trigger Svelte reactivity
            };

            img.src = URL.createObjectURL(blob);
        } catch (error) {
            console.error('Error caching token image:', error);
            failedTokenImages.add(tokenId);
        }
    }

    // Cache images when token changes
    $: if (token) {
        if (isLPToken(token) && token.poolInfo) {
            cacheTokenImage(token.poolInfo.tokAId);
            cacheTokenImage(token.poolInfo.tokBId);
        }
        else {
            cacheTokenImage(token.id);
        }
    }

    async function fetchTokenDetails() {
        try {
            // Only fetch if we haven't already
            if (!creator || !totalSupply) {
                if (typeof token === 'object' && 'type' in token && token.type === 'arc200') {
                    // https://mainnet-idx.nautilus.sh/nft-indexer/v1/arc200/tokens?contractId=390001
                    const response = await fetch(`https://voi-mainnet-mimirapi.voirewards.com/arc200/tokens?contractId=${token.id}`);
                    const data = await response.json();
                    creator = data.tokens[0].creator;
                    totalSupply = data.tokens[0].totalSupply;
                }
                else {
                    const assetInfo = await algodClient.getAssetByID(Number(token.id)).do();
                    creator = assetInfo.params.creator;
                    totalSupply = assetInfo.params.total;
                }
                
                // Fetch Envoi name for creator
                if (creator) {
                    const envoiResults = await getEnvoiNames([creator]);
                    creatorEnvoiName = envoiResults.length > 0 ? envoiResults[0].name : null;
                }
            }
        } catch (err) {
            console.error('Error fetching token details:', err);
        }
    }

    async function toggleExpand() {
        isExpanded = !isExpanded;
        if (isExpanded) {
            await fetchTokenDetails();
        }
    }

    function isLPToken(token: FungibleTokenType | LPToken): token is LPToken {
        return 'poolInfo' in token && token.poolInfo !== undefined;
    }

    function formatNumber(value: number | undefined, decimals: number = 6): string {
        if (value === undefined || !isFinite(value)) return '0';

        try {
            if (BigInt(value) >= BigInt(10_000_000_000_000_000_000_000_000_000_000)) {
                return 'Unlimited';
            }
        } catch (err) {
            // silent fail
        }

        return value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: decimals
        });
    }

    function formatLargeNumber(value: number | undefined, decimals: number = 6): string {
        if (value === undefined || !isFinite(value)) return '0';

        // Handle special case for max uint256
        if (value === 115792089237316195423570985008687907853269984665640564039457584007913129639935) {
            return 'Unlimited';
        }

        const units = ['', 'K', 'M', 'B', 'T', 'Q'];
        let unitIndex = 0;
        let scaledValue = value;

        while (scaledValue >= 1000 && unitIndex < units.length - 1) {
            unitIndex += 1;
            scaledValue = scaledValue / 1000;
        }

        // If the number is still too large after all our units
        if (scaledValue > 1000) {
            return 'Unlimited';
        }

        return scaledValue.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals
        }) + units[unitIndex];
    }

    $: poolShare = isLPToken(token) && token.poolInfo ? 
        Number(token.balance) / Number(token.poolInfo.totalSupply) : 
        null;
    $: apr = isLPToken(token) && token.poolInfo ? Number(token.poolInfo.apr) : null;

    // Calculate display value based on token type
    $: displayValue = token.value || 0;

    async function claimTokens(approval: TokenApproval) {
        if (!canSignTransactions || !walletId || !$selectedWallet?.address) {
            return;
        }

        try {
            claimingApproval = approval.transactionId;
            claimingError = null;
            claimSuccess = false;
            claimTxId = null;
            
            const appId = Number(token.id);
            const from = approval.owner;
            const to = walletId;
            const amount = approval.amount;
            
            // Use the ARC-200 utility to execute the transferFrom
            const result = await arc200TransferFrom(
                appId,
                from,
                to,
                amount,
                walletId,
                async (txnsToSign: algosdk.Transaction[]) => {
                    const signedTxns = await signTransactions([txnsToSign]);
                    if (!signedTxns) {
                        throw new Error("User rejected transaction signing");
                    }
                    return signedTxns;
                }
            );
            
            if (!result.success) {
                throw new Error(result.error || "Transfer failed");
            }
            
            // Handle success
            claimSuccess = true;
            claimTxId = result.txId;
            
            // Notify parent component to refresh token data
            dispatch('tokenSent');
            
            // Close expanded details temporarily to refresh the view
            isExpanded = false;
            setTimeout(() => {
                isExpanded = true;
            }, 500);
            
        } catch (error: any) {
            console.error("Error claiming tokens:", error);
            claimingError = error.message || "Failed to claim tokens";
        } finally {
            setTimeout(() => {
                claimingApproval = null;
            }, 3000); // Keep status visible briefly before resetting
        }
    }

    // Check if token is an ARC-200 token
    function isArc200Token(token: FungibleTokenType | LPToken): boolean {
        return token.type === 'arc200';
    }

    // Function to handle opening the manage approvals modal
    function openManageApprovalsModal() {
        if (canSignTransactions && isArc200Token(token)) {
            showManageApprovalsModal = true;
        }
    }

    // Handle approval events
    function handleApprovalEvent() {
        // Also notify parent to refresh token data
        dispatch('tokenSent');
    }
</script>

<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 md:p-4 relative">
    {#if canSignTransactions && token.balance === 0 && token.type !== 'arc200'}
        <button
            class="absolute top-7 right-3 p-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
            on:click={() => showOptOutModal = true}
            title="Remove token from wallet"
            aria-label="Remove token from wallet"
        >
            <i class="fa-solid fa-trash-alt"></i>
        </button>
    {/if}
    <div class="flex items-start space-x-4 flex-col">
        <div class="flex flex-row items-center gap-4 justify-start">
        {#if isLPToken(token) && token.poolInfo}
            {@const tokAId = (token.poolInfo.tokBId === '390001' ? token.poolInfo.tokBId : token.poolInfo.tokAId)}
            {@const tokBId = (token.poolInfo.tokBId === '390001' ? token.poolInfo.tokAId : token.poolInfo.tokBId)}
            <div class="relative w-16 h-16">
                <div class="absolute top-0 left-0 w-12 h-12 rounded-lg backdrop-blur-sm">
                    <img 
                        src={tokenImages.get(tokAId) || (tokAId === '390001' ? '/icons/voi-token.png' : `https://asset-verification.nautilus.sh/icons/${tokAId === '302190' ? '395614' : tokAId}.png`)}
                        alt={token.poolInfo.tokASymbol}
                        class="w-full h-full rounded-lg object-cover"
                        data-token-id={tokAId}
                        on:error={onImageError}
                    />
                </div>
                <div class="absolute bottom-0 right-0 w-12 h-12 rounded-lg backdrop-blur-sm">
                    <img 
                        src={tokenImages.get(tokBId) || (tokBId === '390001' ? '/icons/voi-token.png' : `https://asset-verification.nautilus.sh/icons/${tokBId === '302190' ? '395614' : tokBId}.png`)}
                        alt={token.poolInfo.tokBSymbol}
                        class="w-full h-full rounded-lg object-cover"
                        data-token-id={tokBId}
                        on:error={onImageError}
                    />
                </div>
            </div>
        {:else}
            <div class="relative w-16 h-16">
                <div class="w-full h-full rounded-lg backdrop-blur-sm">
                    <img 
                        src={tokenImages.get(token.id) || (token.id === '390001' ? '/icons/voi-token.png' : `https://asset-verification.nautilus.sh/icons/${token.id === '302190' ? '395614' : token.id}.png`)}
                        alt={token.name} 
                        class="w-full h-full rounded-lg object-cover"
                        data-token-id={token.id}
                        on:error={onImageError}
                    />
                </div>
            </div>
        {/if}
            <div class="flex-1">
                <div class="flex items-center justify-between">
                    <h4 class="font-medium text-gray-900 dark:text-white flex items-center">
                        {#if isLPToken(token) && token.poolInfo}
                            {token.name}
                        {:else}
                            {token.symbol}
                        {/if}
                        {#if token.approvals && token.approvals.filter(approval => approval.amount !== '0').length > 0}
                            <span 
                                class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" 
                                title="This token has approvals for spending by this wallet"
                            >
                                <i class="fas fa-key mr-1"></i>
                                {token.approvals.filter(approval => approval.amount !== '0').length}
                            </span>
                        {/if}
                        {#if token.outgoingApprovals && token.outgoingApprovals.filter(approval => approval.amount !== '0').length > 0}
                            <span 
                                class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" 
                                title="You have approved this token for spending by other wallets"
                            >
                                <i class="fas fa-shield-alt mr-1"></i>
                                {token.outgoingApprovals.filter(approval => approval.amount !== '0').length}
                            </span>
                        {/if}
                    </h4>
                    {#if isLPToken(token) && apr !== null && apr !== 0}
                        <span class="text-sm px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full">
                            APR: {formatNumber(apr)}%
                        </span>
                    {/if}
                </div>

                <div class="mt-2 space-y-2 text-sm">
                    {#if isLPToken(token) && poolShare}
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-gray-500 dark:text-gray-400 text-xs uppercase">Your Share</p>
                                <p class="text-gray-700 dark:text-gray-200">
                                    {formatNumber(token.balance / Math.pow(10, token.decimals))} LP Tokens
                                </p>
                                <p class="text-gray-600 dark:text-gray-300 text-sm">
                                    ({(poolShare * 100).toFixed(2)}% of pool)
                                </p>
                            </div>
                            <div>
                                <p class="text-gray-500 dark:text-gray-400 text-xs uppercase">Value</p>
                                <p class="text-gray-700 dark:text-gray-200">{formatNumber(displayValue, 3)} VOI</p>
                                <p class="text-gray-600 dark:text-gray-300 text-xs">
                                    ${formatNumber(token.usdValue || 0, 4)} USD
                                </p>
                            </div>
                        </div>
                    {:else}
                        <p class="text-gray-600 dark:text-gray-300" title={token.balance / Math.pow(10, token.decimals) + ' ' + token.symbol}>
                            Balance: {formatNumber(token.balance / Math.pow(10, token.decimals))} {token.symbol}
                        </p>
                        <p class="text-gray-600 dark:text-gray-300">
                            Value: {formatNumber(displayValue, 3)} VOI / ${formatNumber(token.usdValue || 0, 4)} USD
                        </p>
                    {/if}


                </div>
            </div>
        </div>
                    <!-- Token Details Section -->
                        <button
                            class="flex items-center gap-1 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 mt-2 place-self-center"
                            on:click={toggleExpand}
                        >
                            <i class="fas fa-chevron-{isExpanded ? 'up' : 'down'} text-xs"></i>
                            <span class="text-sm">{isExpanded ? 'Less' : 'More'} Details</span>
                        </button>

                        {#if isExpanded}
                        {#if !isLPToken(token)}
                            <div class="mt-3 space-y-2 border-t border-gray-200 dark:border-gray-600 pt-3 flex flex-col">
                                <div class="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <p class="text-gray-500 dark:text-gray-400">Decimals</p>
                                        <p class="text-gray-700 dark:text-gray-200">{token.decimals}</p>
                                    </div>
                                    <div>
                                        <p class="text-gray-500 dark:text-gray-400">Total Supply</p>
                                        <p class="text-gray-700 dark:text-gray-200">
                                            {#if totalSupply}
                                                <span class="group relative inline-block">
                                                    {formatLargeNumber(totalSupply / Math.pow(10, token.decimals))} {token.symbol}
                                                </span>
                                            {:else}
                                                ...
                                            {/if}
                                        </p>
                                    </div>
                                    {#if creator}
                                        <div class="col-span-2">
                                            <p class="text-gray-500 dark:text-gray-400">Creator</p>
                                            <div class="flex items-center gap-2">
                                                <a 
                                                    href={`https://voiager.xyz/account/${creator}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-mono text-xs truncate"
                                                >
                                                    {creator}
                                                </a>
                                                {#if creatorEnvoiName}
                                                    <span class="text-purple-500 dark:text-purple-400">
                                                        ({creatorEnvoiName})
                                                    </span>
                                                {/if}
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                                
                                {#if token.approvals && token.approvals.filter(approval => approval.amount !== '0').length > 0}
                                    <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                                        <p class="text-gray-500 dark:text-gray-400 mb-2">
                                            <i class="fas fa-key text-yellow-500 mr-1"></i>
                                            Incoming Approvals ({token.approvals.filter(approval => approval.amount !== '0').length})
                                        </p>
                                        <div class="space-y-2 max-h-40 overflow-y-auto">
                                            {#each token.approvals.filter(approval => approval.amount !== '0') as approval}
                                                <div class="bg-gray-100 dark:bg-gray-600 p-2 rounded-lg text-xs">
                                                    <div class="flex justify-between">
                                                        <span class="text-gray-600 dark:text-gray-300">Owner:</span>
                                                        <a 
                                                            href={`https://voiager.xyz/account/${approval.owner}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-mono truncate max-w-[140px]"
                                                        >
                                                            {approval.owner.slice(0, 8)}...{approval.owner.slice(-8)}
                                                        </a>
                                                    </div>
                                                    <div class="flex justify-between">
                                                        <span class="text-gray-600 dark:text-gray-300">Amount:</span>
                                                        <span class="text-gray-800 dark:text-gray-200">
                                                            {formatNumber(Number(approval.amount) / Math.pow(10, token.decimals))} {token.symbol}
                                                        </span>
                                                    </div>
                                                    <div class="flex justify-between">
                                                        <span class="text-gray-600 dark:text-gray-300">Date:</span>
                                                        <span class="text-gray-800 dark:text-gray-200">
                                                            {new Date(approval.timestamp * 1000).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <div class="flex justify-between items-center mt-2">
                                                        <a 
                                                            href={`https://voiager.xyz/transaction/${approval.transactionId}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                                                        >
                                                            <i class="fas fa-external-link-alt mr-1"></i>
                                                            View Transaction
                                                        </a>
                                                        
                                                        {#if canSignTransactions}
                                                            <button
                                                                on:click={() => claimTokens(approval)}
                                                                class="px-2 py-1 text-xs font-medium text-white {claimSuccess && claimingApproval === approval.transactionId ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'} rounded transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                disabled={claimingApproval !== null}
                                                                title="Transfer these tokens to your wallet"
                                                            >
                                                                {#if claimingApproval === approval.transactionId}
                                                                    {#if claimSuccess}
                                                                        <i class="fas fa-check"></i>
                                                                        Claimed
                                                                    {:else}
                                                                        <div class="w-3 h-3 border-t-2 border-r-2 border-white rounded-full animate-spin mr-1"></div>
                                                                        Claiming...
                                                                    {/if}
                                                                {:else}
                                                                    <i class="fas fa-hand-holding-dollar"></i>
                                                                    Claim
                                                                {/if}
                                                            </button>
                                                        {/if}
                                                    </div>
                                                    {#if claimingError && claimingApproval === approval.transactionId}
                                                        <div class="mt-2 text-red-500 text-xs">
                                                            {claimingError}
                                                        </div>
                                                    {/if}
                                                    {#if claimSuccess && claimingApproval === approval.transactionId && claimTxId}
                                                        <div class="mt-2 text-green-500 text-xs">
                                                            Transaction successful! 
                                                            <a 
                                                                href={`https://voiager.xyz/transaction/${claimTxId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                class="underline hover:text-green-600"
                                                            >
                                                                View transaction
                                                            </a>
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}

                                <!-- Outgoing approvals section - new code -->
                                {#if isArc200Token(token) && (token.outgoingApprovals && token.outgoingApprovals.filter(approval => approval.amount !== '0').length > 0)}
                                    <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                                        <div class="flex justify-between items-center mb-2">
                                            <p class="text-gray-500 dark:text-gray-400">
                                                <i class="fas fa-shield-alt text-blue-500 mr-1"></i>
                                                Outgoing Approvals {token.outgoingApprovals && token.outgoingApprovals.filter(approval => approval.amount !== '0').length > 0 ? `(${token.outgoingApprovals.filter(approval => approval.amount !== '0').length})` : ''}
                                            </p>
                                            <button
                                                on:click={openManageApprovalsModal}
                                                class="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded transition-colors"
                                                disabled={!canSignTransactions}
                                                title={canSignTransactions ? "Manage token approvals" : "Connect wallet to manage approvals"}
                                            >
                                                <i class="fas fa-cog mr-1"></i>
                                                Manage
                                            </button>
                                        </div>
                                        <div class="space-y-2 max-h-40 overflow-y-auto">
                                            {#each token.outgoingApprovals.filter(approval => approval.amount !== '0') as approval}
                                                <div class="bg-blue-50 dark:bg-blue-900/30 p-2 rounded-lg text-xs">
                                                    <div class="flex justify-between">
                                                        <span class="text-gray-600 dark:text-gray-300">Spender:</span>
                                                        <a 
                                                            href={`https://voiager.xyz/account/${approval.spender}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-mono truncate max-w-[140px]"
                                                        >
                                                            {approval.spender.slice(0, 8)}...{approval.spender.slice(-8)}
                                                        </a>
                                                    </div>
                                                    <div class="flex justify-between">
                                                        <span class="text-gray-600 dark:text-gray-300">Amount:</span>
                                                        <span class="text-gray-800 dark:text-gray-200">
                                                            {(Number(approval.amount) / Math.pow(10, token.decimals)).toLocaleString()} {token.symbol}
                                                        </span>
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {:else}
                            <div class="mt-3 space-y-2 border-t border-gray-200 dark:border-gray-600 pt-3 flex flex-col">
                                <p class="text-gray-500 dark:text-gray-400">
                                    This token represents your share in a liquidity pool:
                                </p>
                                {#if token.poolInfo}
                                    <div class="grid grid-cols-2 gap-2 text-sm mt-2">
                                        <div>
                                            <p class="text-gray-500 dark:text-gray-400">{token.poolInfo.tokASymbol} Amount</p>
                                            <p class="text-gray-700 dark:text-gray-200">
                                                {formatNumber(
                                                    (poolShare || 0) * (
                                                        token.poolInfo.provider === 'humble' 
                                                            ? Number(token.poolInfo.tokABalance)
                                                            : Number(token.poolInfo.tokABalance) / Math.pow(10, token.poolInfo.tokADecimals)
                                                    )
                                                )}
                                            </p>
                                        </div>
                                        <div>
                                            <p class="text-gray-500 dark:text-gray-400">{token.poolInfo.tokBSymbol} Amount</p>
                                            <p class="text-gray-700 dark:text-gray-200">
                                                {formatNumber(
                                                    (poolShare || 0) * (
                                                        token.poolInfo.provider === 'humble' 
                                                            ? Number(token.poolInfo.tokBBalance)
                                                            : Number(token.poolInfo.tokBBalance) / Math.pow(10, token.poolInfo.tokBDecimals)
                                                    )
                                                )}
                                            </p>
                                        </div>
                                        <div class="col-span-2">
                                            <p class="text-gray-500 dark:text-gray-400">Pool Provider</p>
                                            <p class="text-gray-700 dark:text-gray-200 capitalize">
                                                {token.poolInfo.provider}
                                            </p>
                                        </div>
                                    </div>
                                {/if}
                                
                                {#if token.approvals && token.approvals.filter(approval => approval.amount !== '0').length > 0}
                                    <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                                        <p class="text-gray-500 dark:text-gray-400 mb-2">
                                            <i class="fas fa-key text-yellow-500 mr-1"></i>
                                            Approvals ({token.approvals.filter(approval => approval.amount !== '0').length})
                                        </p>
                                        <div class="space-y-2 max-h-40 overflow-y-auto">
                                            {#each token.approvals.filter(approval => approval.amount !== '0') as approval}
                                                <div class="bg-gray-100 dark:bg-gray-600 p-2 rounded-lg text-xs">
                                                    <div class="flex justify-between">
                                                        <span class="text-gray-600 dark:text-gray-300">Owner:</span>
                                                        <a 
                                                            href={`https://voiager.xyz/account/${approval.owner}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-mono truncate max-w-[140px]"
                                                        >
                                                            {approval.owner.slice(0, 8)}...{approval.owner.slice(-8)}
                                                        </a>
                                                    </div>
                                                    <div class="flex justify-between">
                                                        <span class="text-gray-600 dark:text-gray-300">Amount:</span>
                                                        <span class="text-gray-800 dark:text-gray-200">
                                                            {formatNumber(Number(approval.amount) / Math.pow(10, token.decimals))} {token.symbol}
                                                        </span>
                                                    </div>
                                                    <div class="flex justify-between">
                                                        <span class="text-gray-600 dark:text-gray-300">Date:</span>
                                                        <span class="text-gray-800 dark:text-gray-200">
                                                            {new Date(approval.timestamp * 1000).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <div class="flex justify-between items-center mt-2">
                                                        <a 
                                                            href={`https://voiager.xyz/transaction/${approval.transactionId}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                                                        >
                                                            <i class="fas fa-external-link-alt mr-1"></i>
                                                            View Transaction
                                                        </a>
                                                        
                                                        {#if canSignTransactions}
                                                            <button
                                                                on:click={() => claimTokens(approval)}
                                                                class="px-2 py-1 text-xs font-medium text-white {claimSuccess && claimingApproval === approval.transactionId ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'} rounded transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                disabled={claimingApproval !== null}
                                                                title="Transfer these tokens to your wallet"
                                                            >
                                                                {#if claimingApproval === approval.transactionId}
                                                                    {#if claimSuccess}
                                                                        <i class="fas fa-check"></i>
                                                                        Claimed
                                                                    {:else}
                                                                        <div class="w-3 h-3 border-t-2 border-r-2 border-white rounded-full animate-spin mr-1"></div>
                                                                        Claiming...
                                                                    {/if}
                                                                {:else}
                                                                    <i class="fas fa-hand-holding-dollar"></i>
                                                                    Claim
                                                                {/if}
                                                            </button>
                                                        {/if}
                                                    </div>
                                                    {#if claimingError && claimingApproval === approval.transactionId}
                                                        <div class="mt-2 text-red-500 text-xs">
                                                            {claimingError}
                                                        </div>
                                                    {/if}
                                                    {#if claimSuccess && claimingApproval === approval.transactionId && claimTxId}
                                                        <div class="mt-2 text-green-500 text-xs">
                                                            Transaction successful! 
                                                            <a 
                                                                href={`https://voiager.xyz/transaction/${claimTxId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                class="underline hover:text-green-600"
                                                            >
                                                                View transaction
                                                            </a>
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    {/if}
        <div class="flex items-center gap-3 text-xs font-mono pt-2 place-self-center">
            <a href={`https://voiager.xyz/token/${token.id}`} target="_blank" 
                class="flex flex-col items-center text-blue-500 hover:text-blue-600"
                rel="noopener noreferrer">
                <div>ID</div>
                <div>{token.id}</div>
            </a>
            {#if isLPToken(token)}
                <span class="text-gray-400">|</span>
                <a href={token.poolInfo.provider === 'humble' ? `https://voi.humble.sh/#/pool/add?poolId=${token.poolId}` : `https://voi.nomadex.app/liquidity/${token.poolId}/add`} 
                    target="_blank"
                    class="flex flex-col items-center group"
                    rel="noopener noreferrer">
                    <i class="fa-solid fa-circle-plus text-green-500 group-hover:text-green-600"></i>
                    <span class="text-green-500 group-hover:text-green-600">Liquidity</span>
                </a>
                <span class="text-gray-400">|</span>
                <a href={token.poolInfo.provider === 'humble' ? `https://voi.humble.sh/#/pool/remove?poolId=${token.poolId}` : `https://voi.nomadex.app/liquidity/${token.poolId}/remove`} 
                    target="_blank"
                    class="flex flex-col items-center group"
                    rel="noopener noreferrer">
                    <i class="fa-solid fa-circle-minus text-red-500 group-hover:text-red-600"></i>
                    <span class="text-red-500 group-hover:text-red-600">Liquidity</span>
                </a>
            {:else if token.poolId}
                <span class="text-gray-400">|</span>
                <a href={`https://voi.humble.sh/#/swap?poolId=${token.poolId}`} 
                    target="_blank"
                    class="flex flex-col items-center group"
                    rel="noopener noreferrer">
                    <i class="fa-solid fa-right-left mb-1 text-purple-500 group-hover:text-purple-600"></i>
                    <span class="text-purple-500 group-hover:text-purple-600">Trade</span>
                </a>
            {/if}
            {#if !isLPToken(token)}
                <span class="text-gray-400">|</span>
                <button
                    class="flex flex-col items-center group {canSignTransactions ? '' : 'opacity-50 cursor-not-allowed'}"
                    on:click={() => canSignTransactions ? showSendModal = true : null}
                    aria-label="Send token"
                    title={canSignTransactions ? 'Send token' : 'Connect wallet to send token'}
                >
                    <i class="fa-solid fa-paper-plane text-blue-500 group-hover:text-blue-600"></i>
                    <span class="text-blue-500 group-hover:text-blue-600">Send</span>
                </button>

                <!-- Add Manage Approvals button for ARC-200 tokens -->
                {#if isArc200Token(token)}
                    <span class="text-gray-400">|</span>
                    <button
                        class="flex flex-col items-center group {canSignTransactions ? '' : 'opacity-50 cursor-not-allowed'}"
                        on:click={() => canSignTransactions ? openManageApprovalsModal() : null}
                        aria-label="Manage approvals"
                        title={canSignTransactions ? 'Manage token approvals' : 'Connect wallet to manage approvals'}
                    >
                        <i class="fa-solid fa-shield-alt text-blue-500 group-hover:text-blue-600"></i>
                        <span class="text-blue-500 group-hover:text-blue-600">Approvals</span>
                    </button>
                {/if}
            {/if}
            <span class="text-gray-400">|</span>
            <button
                class="flex flex-col items-center group"
                on:click={() => showTransfersModal = true}
            >
                <i class="fa-solid fa-clock-rotate-left text-blue-500 group-hover:text-blue-600"></i>
                <span class="text-blue-500 group-hover:text-blue-600">Transfers</span>
            </button>
        </div>
</div>
    {#if isLPToken(token) && token.poolInfo.provider}
        <div class="absolute bottom-3 left-3">
            {#if token.poolInfo.provider === 'humble'}
                <a href="https://voi.humble.sh/#/swap?poolId=${token.poolId}" target="_blank" rel="noopener noreferrer">
                    <div class="w-6 h-6 rounded backdrop-blur-sm">
                        <img src="/icons/humble_icon.png" alt="Humble" class="w-full h-full rounded object-cover" />
                    </div>
                </a>
            {:else if token.poolInfo.provider === 'nomadex'}
                <a href={`https://voi.nomadex.app/${token.poolInfo.tokAType}/${token.poolInfo.tokAId}/${token.poolInfo.tokBType}/${token.poolInfo.tokBId}`} target="_blank" rel="noopener noreferrer">
                    <div class="w-6 h-6 rounded backdrop-blur-sm">
                        <img src="/icons/nomadex_icon.ico" alt="Nomadex" class="w-full h-full rounded object-cover" />
                    </div>
                </a>
            {/if}
        </div>
    {/if}
</div>

{#if showOptOutModal}
    <OptOutModal 
        bind:open={showOptOutModal}
        {token}
        onTokenOptedOut={() => {
            dispatch('tokenOptedOut');
        }}
    />
{/if}

{#if showSendModal}
    <SendTokenModal 
        bind:open={showSendModal}
        {token}
        onTokenSent={() => {
            dispatch('tokenSent');
        }}
        tokens={fungibleTokens}
    />
{/if}

{#if showTransfersModal && walletId}
    <TokenTransfersModal 
        bind:open={showTransfersModal}
        {token}
        {walletId}
        currentPoolBalance={isLPToken(token) && token.poolInfo ? {
            tokenA: calculateUserTokenShare(token, 'A'),
            tokenB: calculateUserTokenShare(token, 'B')
        } : null}
    />
{/if}

<!-- Add the ManageApprovalsModal -->
{#if showManageApprovalsModal}
    <ManageApprovalsModal 
        bind:open={showManageApprovalsModal}
        {token}
        {walletId}
        on:approvalCreated={handleApprovalEvent}
        on:approvalRevoked={handleApprovalEvent}
    />
{/if}

<script context="module">
    // Helper function to calculate user's share of a token in the pool
    function calculateUserTokenShare(token: LPToken, tokenType: 'A' | 'B'): number {
        try {
            // User's LP token balance in decimal form
            const userLpBalance = Number(token.balance) / Math.pow(10, token.decimals);
            
            // Total supply of LP tokens
            let totalSupply;
            
            // For Humble pools, the totalSupply is already in decimal form
            if (token.poolInfo.provider === 'humble') {
                totalSupply = Number(token.poolInfo.totalSupply / Math.pow(10, 6));
            } else {
                // For other providers, we need to divide by 10^decimals
                totalSupply = Number(token.poolInfo.totalSupply) / Math.pow(10, token.decimals);
            }
            
            if (totalSupply <= 0 || userLpBalance <= 0) return 0;
            
            // Calculate user's share as a decimal (0-1)
            const userShare = userLpBalance / totalSupply;
            
            // Get the token balance from the pool
            const tokenBalance = tokenType === 'A' 
                ? Number(token.poolInfo.tokABalance) 
                : Number(token.poolInfo.tokBBalance);
                
            // Get the token decimals
            const tokenDecimals = tokenType === 'A'
                ? token.poolInfo.tokADecimals
                : token.poolInfo.tokBDecimals;
            
            // For Humble, the balance is already in decimal form
            // For other providers, we need to divide by 10^decimals
            let result;
            if (token.poolInfo.provider === 'humble') {
                result = userShare * tokenBalance;
            } else {
                result = userShare * (tokenBalance / Math.pow(10, tokenDecimals));
            }
            
            return result;
        } catch (error) {
            console.error(`Error calculating token ${tokenType} share:`, error);
            return 0;
        }
    }
</script>