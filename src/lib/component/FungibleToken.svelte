<script lang="ts">
    import type { FungibleTokenType, LPToken } from '$lib/types/assets';
    import { createEventDispatcher } from 'svelte';
    import SendTokenModal from './SendTokenModal.svelte';
    import OptOutModal from './OptOutModal.svelte';
    import TokenTransfersModal from './TokenTransfersModal.svelte';
    import { getEnvoiNames } from '$lib/utils/envoi';
    import { algodClient } from '$lib/utils/algod';

    const dispatch = createEventDispatcher();

    export let token: FungibleTokenType | LPToken;
    export let voiPrice: number;
    export let canSignTransactions = false;
    export let walletId: string | undefined;
    let showOptOutModal = false;
    let showSendModal = false;
    let showTransfersModal = false;
    let isExpanded = false;
    let creatorEnvoiName: string | null = null;
    let totalSupply: number | null = null;
    let creator: string | null = null;
    let tokenImages = new Map<string, string>();

    async function cacheTokenImage(tokenId: string) {
        if (!tokenId || tokenImages.has(tokenId)) return;
        
        try {
            const response = await fetch(`https://asset-verification.nautilus.sh/icons/${tokenId}.png`);
            if (!response.ok) return;
            
            const blob = await response.blob();
            const img = new Image();
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

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
        }
    }

    // Cache images when token changes
    $: if (token) {
        if (isLPToken(token) && token.poolInfo) {
            cacheTokenImage(token.poolInfo.tokAId);
            cacheTokenImage(token.poolInfo.tokBId);
        }
        cacheTokenImage(token.id);
    }

    async function fetchTokenDetails() {
        try {
            // Only fetch if we haven't already
            if (!creator || !totalSupply) {
                if (typeof token === 'object' && 'type' in token && token.type === 'arc200') {
                    // https://mainnet-idx.nautilus.sh/nft-indexer/v1/arc200/tokens?contractId=390001
                    const response = await fetch(`https://mainnet-idx.nautilus.sh/nft-indexer/v1/arc200/tokens?contractId=${token.id}`);
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
</script>

<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 md:p-4 relative">
    {#if canSignTransactions && token.balance === 0}
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
            <div class="relative w-16 h-16">
                <div class="absolute top-0 left-0 w-12 h-12 rounded-lg backdrop-blur-sm">
                    <img 
                        src={tokenImages.get(token.poolInfo.tokAId) || (token.poolInfo.tokAId === '390001' ? '/icons/voi-token.png' : `https://asset-verification.nautilus.sh/icons/${token.poolInfo.tokAId === '302190' ? '395614' : token.poolInfo.tokAId}.png`)}
                        alt={token.poolInfo.tokASymbol}
                        class="w-full h-full rounded-lg object-cover"
                    />
                </div>
                <div class="absolute bottom-0 right-0 w-12 h-12 rounded-lg backdrop-blur-sm">
                    <img 
                        src={tokenImages.get(token.poolInfo.tokBId) || (token.poolInfo.tokBId === '390001' ? '/icons/voi-token.png' : `https://asset-verification.nautilus.sh/icons/${token.poolInfo.tokBId === '302190' ? '395614' : token.poolInfo.tokBId}.png`)}
                        alt={token.poolInfo.tokBSymbol}
                        class="w-full h-full rounded-lg object-cover"
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
                    />
                </div>
            </div>
        {/if}
            <div class="flex-1">
                <div class="flex items-center justify-between">
                    <h4 class="font-medium text-gray-900 dark:text-white">
                        {#if isLPToken(token) && token.poolInfo}
                            {token.name}
                        {:else}
                            {token.symbol}
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
                                    (${formatNumber(displayValue * voiPrice, 3)} USD)
                                </p>
                            </div>
                        </div>
                    {:else}
                        <p class="text-gray-600 dark:text-gray-300" title={token.balance / Math.pow(10, token.decimals) + ' ' + token.symbol}>
                            Balance: {formatNumber(token.balance / Math.pow(10, token.decimals))} {token.symbol}
                        </p>
                        <p class="text-gray-600 dark:text-gray-300">
                            Value: {formatNumber(displayValue, 3)} VOI / ${formatNumber(displayValue * voiPrice, 3)} USD
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
                    <i class="fa-solid fa-circle-plus text-purple-500 group-hover:text-purple-600"></i>
                    <span class="text-purple-500 group-hover:text-purple-600">Liquidity</span>
                </a>
                <span class="text-gray-400">|</span>
                <a href={token.poolInfo.provider === 'humble' ? `https://voi.humble.sh/#/pool/remove?poolId=${token.poolId}` : `https://voi.nomadex.app/liquidity/${token.poolId}/remove`} 
                    target="_blank"
                    class="flex flex-col items-center group"
                    rel="noopener noreferrer">
                    <i class="fa-solid fa-circle-minus text-purple-500 group-hover:text-purple-600"></i>
                    <span class="text-purple-500 group-hover:text-purple-600">Liquidity</span>
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