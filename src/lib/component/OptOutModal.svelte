<script lang="ts">
    import type { FungibleTokenType, LPToken } from '$lib/types/assets';
    import { Modal, Button } from 'flowbite-svelte';
    import { signTransactions, selectedWallet } from 'avm-wallet-svelte';
    import { algodClient } from '$lib/utils/algod';
    import algosdk from 'algosdk';
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher();

    export let open = false;
    export let token: FungibleTokenType | LPToken;
    export let onTokenOptedOut: () => void;
    
    let isOptingOut = false;
    let optOutError: string | null = null;
    let optOutSuccess = false;

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
                onTokenOptedOut();
                setTimeout(() => {
                    open = false;
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
        open = false;
        isOptingOut = false;
        optOutError = null;
        optOutSuccess = false;
    }
</script>

<Modal bind:open size="md" on:close={resetOptOutState}>
    <div class="text-center">
        <h3 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">Opt Out of {token.symbol}</h3>
        
        {#if !optOutSuccess}
            <p class="mb-6 text-gray-700 dark:text-gray-300">
                You are about to opt out of {token.symbol} ({token.id}). This will remove the asset from your account and decrease your minimum balance requirement by 0.1 VOI. Any remaining balance of this asset in your account will be burned. You may opt back into the asset in the future.
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