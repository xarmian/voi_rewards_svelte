<script lang="ts">
    import type { FungibleTokenType, LPToken } from '$lib/types/assets';

    export let token: FungibleTokenType | LPToken;
    export let voiPrice: number;
    let errorHandled = false;

    function isLPToken(token: FungibleTokenType | LPToken): token is LPToken {
        return 'poolInfo' in token;
    }

    function calculateLPValue(token: LPToken): number {
        const userShare = Number(token.balance) / Number(token.poolInfo.totalSupply);
        const tokABalance = Number(token.poolInfo.tokABalance);
        const tokBBalance = Number(token.poolInfo.tokBBalance);

        // If either token is VOI, use its balance for value calculation
        if (token.poolInfo.tokAId === '0') {
            return (tokABalance * userShare * 2) / 1e6; // Multiply by 2 since it's paired
        } else if (token.poolInfo.tokBId === '0') {
            return (tokBBalance * userShare * 2) / 1e6;
        }

        // If neither token is VOI, return 0 for now
        return 0;
    }

    function handleImageError(event: Event) {
        const img = event.target as HTMLImageElement;
        if (!errorHandled) {
            img.src = "/icons/default-token-image.svg";
            errorHandled = true;
        }
    }

    function formatNumber(value: number, decimals: number = 6): string {
        return value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: decimals
        });
    }

    function getTokenImageUrl(tokenId: string): string {
        if (tokenId === '390001') {
            return "/icons/voi-token.png";
        }
        return `https://asset-verification.nautilus.sh/icons/${tokenId}.png`;
    }

    $: poolShare = isLPToken(token) ? 
        (Number(token.balance / Math.pow(10, token.decimals)) / Number(token.poolInfo.totalSupply)) : 
        null;
    $: apr = isLPToken(token) ? Number(token.poolInfo.apr) : null;
</script>

<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
    <div class="flex items-center space-x-4">
        {#if isLPToken(token)}
            <div class="relative w-16 h-16">
                <img 
                    src={getTokenImageUrl(token.poolInfo.tokAId)} 
                    alt={token.poolInfo.tokASymbol}
                    class="absolute top-0 left-0 w-12 h-12 rounded-lg object-cover border-2 border-gray-50 dark:border-gray-700"
                    on:error={handleImageError}
                />
                <img 
                    src={getTokenImageUrl(token.poolInfo.tokBId)} 
                    alt={token.poolInfo.tokBSymbol}
                    class="absolute bottom-0 right-0 w-12 h-12 rounded-lg object-cover border-2 border-gray-50 dark:border-gray-700"
                    on:error={handleImageError}
                />
            </div>
        {:else}
            <img 
                src={token.imageUrl} 
                alt={token.name} 
                class="w-16 h-16 rounded-lg object-cover"
                on:error={handleImageError}
            />
        {/if}
        <div class="flex-1">
            <div class="flex items-center justify-between">
                <h4 class="font-medium text-gray-900 dark:text-white">
                    {#if isLPToken(token)}
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
                                {formatNumber(token.balance / 10 ** token.decimals)} LP Tokens
                            </p>
                            <p class="text-gray-600 dark:text-gray-300 text-sm">
                                ({(poolShare * 100).toFixed(2)}% of pool)
                            </p>
                        </div>
                        <div>
                            <p class="text-gray-500 dark:text-gray-400 text-xs uppercase">Value</p>
                            <p class="text-gray-700 dark:text-gray-200">{formatNumber(token.value)} VOI</p>
                            <p class="text-gray-600 dark:text-gray-300 text-sm">
                                (${formatNumber(token.value * voiPrice)} USD)
                            </p>
                        </div>
                    </div>
                    <div class="pt-2 border-t border-gray-200 dark:border-gray-600">
                        <p class="text-gray-500 dark:text-gray-400 text-xs uppercase mb-1">Your Pool Assets</p>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-gray-700 dark:text-gray-200">
                                    {formatNumber(Number(token.poolInfo.tokABalance) * poolShare)} {token.poolInfo.tokASymbol}
                                </p>
                            </div>
                            <div>
                                <p class="text-gray-700 dark:text-gray-200">
                                    {formatNumber(Number(token.poolInfo.tokBBalance) * poolShare)} {token.poolInfo.tokBSymbol}
                                </p>
                            </div>
                        </div>
                    </div>
                {:else}
                    <p class="text-gray-600 dark:text-gray-300">
                        Balance: {formatNumber(token.balance / 10 ** token.decimals)} {token.symbol}
                    </p>
                    <p class="text-gray-600 dark:text-gray-300">
                        Value: {formatNumber(token.value)} VOI / ${formatNumber(token.value * voiPrice)} USD
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
                </div>
            </div>
        </div>
    </div>
</div>
