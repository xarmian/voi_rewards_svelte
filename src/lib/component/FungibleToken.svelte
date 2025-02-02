<script lang="ts">
    import type { FungibleTokenType, LPToken } from '$lib/types/assets';
    import { imageCache } from '$lib/stores/imageCache';
    import { signTransactions, selectedWallet } from 'avm-wallet-svelte';
    import { Modal, Button } from 'flowbite-svelte';
    import { algodClient } from '$lib/utils/algod';
    import algosdk from 'algosdk';
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher();

    export let token: FungibleTokenType | LPToken;
    export let voiPrice: number;
    let showOptOutModal = false;
    let isOptingOut = false;
    let optOutError: string | null = null;
    let optOutSuccess = false;

    function getTokenImageUrl(tokenId: string): string {
        if (tokenId === '390001') {
            return "/icons/voi-token.png";
        }
        else if (tokenId === '302190') {
            tokenId = '395614';
        }
        return `https://asset-verification.nautilus.sh/icons/${tokenId}.png`;
    }

    function getFallbackUrl(): string {
        return "/icons/default-token-image.svg";
    }

    function handleImageError(imageUrl: string, event: Event) {
        const img = event.target as HTMLImageElement;
        if (!imageCache.hasFailed(imageUrl)) {
            imageCache.markAsFailed(imageUrl);
        }
        // Always set fallback, even if already marked failed
        img.src = getFallbackUrl();
    }

    function isLPToken(token: FungibleTokenType | LPToken): token is LPToken {
        return 'poolInfo' in token && token.poolInfo !== undefined;
    }

    function formatNumber(value: number | undefined, decimals: number = 6): string {
        if (value === undefined || !isFinite(value)) return '0';
        return value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: decimals
        });
    }

    $: poolShare = isLPToken(token) && token.poolInfo ? 
        (Number(token.balance) / Math.pow(10, token.decimals)) / Number(token.poolInfo.totalSupply) : 
        null;
    $: apr = isLPToken(token) && token.poolInfo ? Number(token.poolInfo.apr) : null;

    // Calculate display value based on token type
    $: displayValue = token.value || 0;

    // Add reactive statement to pre-cache images
    $: if (token) {
        (async () => {
            try {
                if (isLPToken(token) && token.poolInfo) {
                    const tokAUrl = getTokenImageUrl(token.poolInfo.tokAId);
                    const tokBUrl = getTokenImageUrl(token.poolInfo.tokBId);
                    await imageCache.cacheImage(tokAUrl);
                    await imageCache.cacheImage(tokBUrl);
                } else {
                    const imageUrl = getTokenImageUrl(token.id);
                    await imageCache.cacheImage(imageUrl);
                }
            } catch {} // Errors are handled in the cache
        })();
    }

    async function handleOptOut() {
        if (!$selectedWallet?.address) {
            optOutError = 'Please connect your wallet first';
            return;
        }

        if ($selectedWallet?.app === '') {
            optOutError = 'Wallet not found. Please re-select your account and/or ensure you are not using a Watch account.';
            return;
        }

        try {
            isOptingOut = true;
            optOutError = null;
            
            const suggestedParams = await algodClient.getTransactionParams().do();
            const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                from: $selectedWallet.address,
                to: $selectedWallet.address,
                assetIndex: Number(token.id),
                amount: 0,
                suggestedParams,
                closeRemainderTo: $selectedWallet.address
            });

            const signedTxns = await signTransactions([[
                txn
            ]]);
            
            if (signedTxns) {
                const response = await algodClient.sendRawTransaction(signedTxns[0]).do();
                await algosdk.waitForConfirmation(algodClient, response.txId, 4);
                optOutSuccess = true;
                dispatch('tokenOptedOut');
                setTimeout(() => {
                    showOptOutModal = false;
                    optOutSuccess = false;
                }, 2000);
            }
        } catch (error) {
            console.error('Error opting out:', error);
            optOutError = error instanceof Error ? error.message : 'Failed to opt out of the asset. Please try again.';
        } finally {
            isOptingOut = false;
        }
    }

    function resetOptOutState() {
        showOptOutModal = false;
        isOptingOut = false;
        optOutError = null;
        optOutSuccess = false;
    }
</script>

<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
    <div class="flex items-center space-x-4">
        {#if isLPToken(token) && token.poolInfo}
            {@const tokenAUrl = getTokenImageUrl(token.poolInfo.tokAId)}
            {@const tokenBUrl = getTokenImageUrl(token.poolInfo.tokBId)}
            <div class="relative w-16 h-16">
                <img 
                    src={imageCache.getCachedUrl(tokenAUrl) || (imageCache.hasFailed(tokenAUrl) ? getFallbackUrl() : tokenAUrl)}
                    alt={token.poolInfo.tokASymbol}
                    class="absolute top-0 left-0 w-12 h-12 rounded-lg object-cover border-2 border-gray-50 dark:border-gray-700"
                    on:error={(e) => handleImageError(tokenAUrl, e)}
                />
                <img 
                    src={imageCache.getCachedUrl(tokenBUrl) || (imageCache.hasFailed(tokenBUrl) ? getFallbackUrl() : tokenBUrl)}
                    alt={token.poolInfo.tokBSymbol}
                    class="absolute bottom-0 right-0 w-12 h-12 rounded-lg object-cover border-2 border-gray-50 dark:border-gray-700"
                    on:error={(e) => handleImageError(tokenBUrl, e)}
                />
            </div>
        {:else}
            {@const imageUrl = getTokenImageUrl(token.id)}
            <div class="relative w-16 h-16">
                <img 
                    src={imageCache.getCachedUrl(imageUrl) || (imageCache.hasFailed(imageUrl) ? getFallbackUrl() : imageUrl)}
                    alt={token.name} 
                    class="w-16 h-16 rounded-lg object-cover"
                    on:error={(e) => handleImageError(imageUrl, e)}
                />
            </div>
        {/if}
        <div class="flex-1">
            <div class="flex items-center justify-between">
                <h4 class="font-medium text-gray-900 dark:text-white">
                    {#if isLPToken(token) && token.poolInfo}
                        {token.poolInfo.tokASymbol}/{token.poolInfo.tokBSymbol} LP
                    {:else}
                        {token.symbol}
                    {/if}
                </h4>
                {#if isLPToken(token) && apr !== null}
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
                    <p class="text-gray-600 dark:text-gray-300">
                        Balance: {formatNumber(token.balance / Math.pow(10, token.decimals))} {token.symbol}
                    </p>
                    <p class="text-gray-600 dark:text-gray-300">
                        Value: {formatNumber(displayValue, 3)} VOI / ${formatNumber(displayValue * voiPrice, 3)} USD
                    </p>
                {/if}

                <div class="flex items-center gap-2 text-xs font-mono pt-2">
                    <a href={`https://voiager.xyz/token/${token.id}`} target="_blank" 
                        class="text-blue-500 hover:text-blue-600"
                        rel="noopener noreferrer">
                        ID: {token.id}
                    </a>
                    {#if isLPToken(token)}
                        <span class="text-gray-400">|</span>
                        <a href={`https://voi.humble.sh/#/pool/add?poolId=${token.poolId}`} target="_blank"
                            class="text-purple-500 hover:text-purple-600"
                            rel="noopener noreferrer">
                            Add Liquidity
                        </a>
                        <span class="text-gray-400">|</span>
                        <a href={`https://voi.humble.sh/#/pool/remove?poolId=${token.poolId}`} target="_blank"
                            class="text-purple-500 hover:text-purple-600"
                            rel="noopener noreferrer">
                            Remove Liquidity
                        </a>
                    {:else if token.poolId}
                        <span class="text-gray-400">|</span>
                        <a href={`https://voi.humble.sh/#/swap?poolId=${token.poolId}`} target="_blank"
                            class="text-purple-500 hover:text-purple-600"
                            rel="noopener noreferrer">
                            Trade on Humble
                        </a>
                    {/if}
                    {#if token.balance === 0}
                        <span class="text-gray-400">|</span>
                        <button
                            class="text-red-500 hover:text-red-600"
                            on:click={() => showOptOutModal = true}
                        >
                            Opt Out
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    </div>
</div>
{#if showOptOutModal}
    <Modal bind:open={showOptOutModal} size="md" on:close={resetOptOutState}>
        <div class="text-center">
            <h3 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">Opt Out of {token.symbol}</h3>
            
            {#if !optOutSuccess}
                <p class="mb-6 text-gray-700 dark:text-gray-300">
                    You are about to opt out of {token.symbol} ({token.id}). This will remove the asset from your account and decrease your minimum balance requirement by 0.1 VOI. This action cannot be undone.
                </p>
                
                {#if optOutError}
                    <div class="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg">
                        {optOutError}
                    </div>
                {/if}

                <div class="flex justify-center gap-4">
                    <Button 
                        color="red" 
                        on:click={handleOptOut} 
                        disabled={isOptingOut}
                    >
                        {#if isOptingOut}
                            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Processing...
                        {:else}
                            Continue
                        {/if}
                    </Button>
                    <Button color="alternative" on:click={resetOptOutState} disabled={isOptingOut}>Cancel</Button>
                </div>
            {:else}
                <div class="mb-6 p-4 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-lg">
                    <svg class="mx-auto mb-2 h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <p>Successfully opted out of {token.symbol}</p>
                </div>
            {/if}
        </div>
    </Modal>
{/if}