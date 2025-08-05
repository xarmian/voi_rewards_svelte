<script lang="ts">
    import type { FungibleTokenType, TokenApproval } from '$lib/types/assets';
    import { createEventDispatcher } from 'svelte';
    import { arc200TransferFrom } from '$lib/utils/arc200';
    import { signTransactions } from 'avm-wallet-svelte';
    import algosdk from 'algosdk';
    import { algodClient } from '$lib/utils/algod';

    const dispatch = createEventDispatcher();

    export let token: FungibleTokenType;
    export let approvals: TokenApproval[];
    export let totalAmount: number;
    export let totalValue: number;
    export let canSignTransactions = false;
    export let walletId: string | undefined;

    let isClaiming = false;
    let claimError: string | null = null;
    let claimSuccess = false;

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

    function handleViewDetails() {
        dispatch('viewDetails', { tokenId: token.id });
    }

    async function handleClaim() {
        if (!canSignTransactions || !walletId || isClaiming) return;
        
        isClaiming = true;
        claimError = null;
        claimSuccess = false;
        
        try {
            // Only handle ARC-200 tokens for now
            if (token.type === 'arc200') {
                // Claim all approvals for this token
                for (const approval of approvals) {
                    const appId = Number(token.id);
                    const from = approval.owner;
                    const to = walletId;
                    const amount = approval.amount;
                    
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
                }
                
                claimSuccess = true;
                dispatch('tokenClaimed', { tokenId: token.id, success: true });
            } else {
                throw new Error("VSA token claiming not yet implemented");
            }
        } catch (error) {
            claimError = error instanceof Error ? error.message : 'Unknown error';
            dispatch('tokenClaimed', { tokenId: token.id, success: false, error: claimError });
        } finally {
            isClaiming = false;
        }
    }
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-yellow-200 dark:border-yellow-700 shadow-sm hover:shadow-md transition-shadow">
    <div class="flex items-center space-x-3 mb-3">
        <img 
            src={token.imageUrl || (token.id === '390001' ? '/icons/voi-token.png' : `https://asset-verification.nautilus.sh/icons/${token.id === '302190' ? '395614' : token.id}.png`)} 
            alt={token.name}
            class="w-8 h-8 rounded-full object-cover"
        />
        <div class="flex-1 min-w-0">
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {token.name}
            </h4>
            <p class="text-xs text-gray-500 dark:text-gray-400">
                {approvals.length} approval{approvals.length !== 1 ? 's' : ''}
            </p>
        </div>
    </div>
    
    <div class="space-y-2">
        <div class="flex justify-between items-center">
            <span class="text-xs text-gray-600 dark:text-gray-300">Amount:</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">
                {formatNumber(totalAmount)} {token.symbol}
            </span>
        </div>
        {#if totalValue > 0}
            <div class="flex justify-between items-center">
                <span class="text-xs text-gray-600 dark:text-gray-300">Value:</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">
                    {formatNumber(totalValue)} VOI
                </span>
            </div>
        {/if}
    </div>

    <div class="flex gap-2 mt-3">
        <button
            on:click={handleViewDetails}
            class="flex-1 px-3 py-2 text-xs font-medium text-yellow-800 dark:text-yellow-200 bg-yellow-100 dark:bg-yellow-800/30 hover:bg-yellow-200 dark:hover:bg-yellow-700/40 rounded-lg transition-colors flex items-center justify-center gap-1"
            title="View token details"
        >
            <i class="fas fa-eye"></i>
            View Details
        </button>
        
        <button
            on:click={handleClaim}
            disabled={!canSignTransactions || isClaiming}
            class="flex-1 px-3 py-2 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg transition-colors flex items-center justify-center gap-1 disabled:cursor-not-allowed"
            title="Claim all approvals for this token"
        >
            {#if isClaiming}
                <div class="w-3 h-3 border-t-2 border-r-2 border-white rounded-full animate-spin"></div>
                Claiming...
            {:else if claimSuccess}
                <i class="fas fa-check"></i>
                Claimed
            {:else}
                <i class="fas fa-hand-holding-dollar"></i>
                Claim
            {/if}
        </button>
    </div>
    
    {#if claimError}
        <div class="mt-2 text-red-500 text-xs">
            {claimError}
        </div>
    {/if}
</div> 