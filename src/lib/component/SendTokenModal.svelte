<script lang="ts">
    import { Modal, Button, Input, Label } from 'flowbite-svelte';
    import { signTransactions, selectedWallet } from 'avm-wallet-svelte';
    import { algodClient, algodIndexer } from '$lib/utils/algod';
    import algosdk from 'algosdk';
    import type { FungibleTokenType } from '$lib/types/assets';
    import WalletSearch from './WalletSearch.svelte';
    import { arc200 as Contract } from 'ulujs';
    import CopyComponent from '$lib/component/ui/CopyComponent.svelte';

    export let open = false;
    export let token: FungibleTokenType | { 
        type: 'native';
        symbol: 'VOI';
        decimals: number;
        balance: number;
        name: string;
        id?: undefined;
    };
    export let onTokenSent: () => void;

    let amount = '';
    let isSending = false;
    let error: string | null = null;
    let success = false;
    let recipientAddress: string | null = null;
    let transactionId: string | null = null;
    let recipientInfo: {
        balance: number;
        createdAt: string;
        hasOptedIn: boolean;
        assetBalance?: number;
    } | null = null;
    let isLoadingRecipient = false;
    let isValidRecipient = false;
    let note: string = '';

    // Helper function to determine if token is native VOI
    function isNativeToken(token: any): boolean {
        return token.type === 'native';
    }

    // Helper function to determine if token is ARC-200
    function isARC200Token(token: any): boolean {
        return token.type === 'arc200';
    }

    $: maxAmount = token.balance / Math.pow(10, token.decimals);
    $: isValidAmount = Number(amount) > 0 && Number(amount) <= maxAmount;
    $: canSubmit = recipientAddress && isValidAmount && isValidRecipient && !isSending;

    async function fetchRecipientInfo(address: string) {
        isLoadingRecipient = true;
        try {
            const [account, block] = await Promise.all([
                algodClient.accountInformation(address).do(),
                algodIndexer.lookupAccountByID(address).do()
                    .then(info => algodIndexer.lookupBlock(info.account['created-at-round']).do())
            ]);

            let assetBalance = 0;
            const hasOptedIn = isARC200Token(token) ? true : 
                account.assets?.some((asset: any) => {
                    if (asset['asset-id'] === Number(token.id)) {
                        assetBalance = asset.amount;
                        return true;
                    }
                    return false;
                }) ?? false;

            // For ARC-200 tokens, fetch balance using the contract
            if (isARC200Token(token)) {
                const contract = new Contract(Number(token.id), algodClient, algodIndexer);
                const balance = await contract.arc200_balanceOf(address);
                if (balance.success) {
                    assetBalance = Number(balance.returnValue);
                }
                else {
                    assetBalance = 0;
                }
            }

            recipientInfo = {
                balance: account.amount,
                createdAt: new Date(block.timestamp * 1000).toLocaleDateString(),
                hasOptedIn,
                assetBalance
            };

            isValidRecipient = true;
            error = null;
        } catch (err) {
            console.error('Error fetching recipient info:', err);
            error = 'Failed to fetch recipient info. Please try again later.';
            recipientInfo = null;
            isValidRecipient = false;
        } finally {
            isLoadingRecipient = false;
        }
    }

    async function handleRecipientSelected(address: string) {
        if (address === recipientAddress) return;
        recipientAddress = address;
        error = null;
        await fetchRecipientInfo(address);
    }

    async function buildVSATransaction(recipientAddress: string, amount: number, suggestedParams: algosdk.SuggestedParams): Promise<algosdk.Transaction[]> {
        if (!$selectedWallet?.address) {
            throw new Error('Wallet not connected');
        }
        const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: $selectedWallet.address,
            to: recipientAddress,
            assetIndex: Number(token.id),
            amount: Math.floor(amount),
            note: note ? new TextEncoder().encode(note) : undefined,
            suggestedParams
        });
        transactionId = txn.txID();
        return [ txn ];
    }

    async function buildARC200Transaction(recipientAddress: string, amount: number): Promise<algosdk.Transaction[]> {
        if (!$selectedWallet?.address) {
            throw new Error('Wallet not connected');
        }

        const contract = new Contract(Number(token.id), algodClient, algodIndexer, {
            acc: {
                addr: $selectedWallet.address,
                sk: new Uint8Array()
            }
        });
        const resp = await contract.arc200_transfer(recipientAddress, BigInt(amount), true, false);

        if (resp && resp.success) {
            const decodedTxns: algosdk.Transaction[] = [];
            const txnsForSigning = resp.txns;

            // base64 decode signed transactions
            for (let i = 0; i < txnsForSigning.length; i++) {
                const bytes = Buffer.from(txnsForSigning[i],'base64');
                let tx = algosdk.decodeUnsignedTransaction(bytes);
                transactionId = tx.txID();
                decodedTxns.push(tx);
            }

            return decodedTxns;
        }

        throw new Error('Failed to build ARC-200 transaction');
    }

    async function buildVOITransaction(recipientAddress: string, amount: number, suggestedParams: algosdk.SuggestedParams): Promise<algosdk.Transaction[]> {
        if (!$selectedWallet?.address) {
            throw new Error('Wallet not connected');
        }
        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: $selectedWallet.address,
            to: recipientAddress,
            amount: Math.floor(amount),
            note: note ? new TextEncoder().encode(note) : undefined,
            suggestedParams
        });
        transactionId = txn.txID();
        return [ txn ];
    }

    async function handleSend() {
        if (!$selectedWallet?.address) {
            error = 'Please connect your wallet first';
            return;
        }

        if (!recipientAddress || !algosdk.isValidAddress(recipientAddress)) {
            error = 'Invalid recipient address';
            return;
        }

        try {
            isSending = true;
            error = null;
            
            const suggestedParams = await algodClient.getTransactionParams().do();
            let txns: algosdk.Transaction[];

            // Build transaction based on token type
            if (isNativeToken(token)) {
                txns = await buildVOITransaction(recipientAddress, Number(amount) * Math.pow(10, token.decimals), suggestedParams);
            } else if (isARC200Token(token)) {
                txns = await buildARC200Transaction(recipientAddress, Number(amount) * Math.pow(10, token.decimals));
            } else {
                txns = await buildVSATransaction(recipientAddress, Number(amount) * Math.pow(10, token.decimals), suggestedParams);
            }

            const signedTxns = await signTransactions([txns]);
            
            if (signedTxns) {
                const response = await algodClient.sendRawTransaction(signedTxns[0]).do();
                await algosdk.waitForConfirmation(algodClient, response.txId, 4);
                success = true;
                onTokenSent();
            }
        } catch (err) {
            console.error('Error sending tokens:', err);
            error = err instanceof Error ? err.message : 'Failed to send tokens. Please try again.';
        } finally {
            isSending = false;
        }
    }

    function resetState() {
        amount = '';
        error = null;
        success = false;
        isSending = false;
        recipientAddress = null;
        transactionId = null;
        recipientInfo = null;
        isLoadingRecipient = false;
        note = '';
    }

    function handleClose() {
        resetState();
        open = false;
    }
</script>

<Modal bind:open size="md" on:close={handleClose} class="overflow-visible">
    <div class="text-center">
        <h3 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">Send {token.symbol}</h3>
        
        {#if !success}
            <div class="space-y-4">
                <div class="text-left">
                    <Label>Recipient</Label>
                    <div class="relative">
                        <WalletSearch
                            onSubmit={handleRecipientSelected}
                            loadPreviousValue={false}
                            storeAddress={false}
                            clearOnSubmit={false}
                            hideSubmitButton={true}
                        />
                    </div>
                    {#if recipientAddress}
                        <div class="mt-2 space-y-2 text-sm">
                            <p class="text-green-600 dark:text-green-400">
                                Selected: <a href={`https://explorer.voi.network/explorer/account/${recipientAddress}`} target="_blank" rel="noopener noreferrer" class="hover:text-green-800 dark:hover:text-green-200 truncate">{recipientAddress.slice(0, 8)}...{recipientAddress.slice(-8)}</a>
                            </p>
                            
                            {#if isLoadingRecipient}
                                <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                    <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Loading account info...
                                </div>
                            {:else if recipientInfo}
                                <div class="bg-gray-50 dark:bg-gray-700 rounded p-3 space-y-1">
                                    <div class="flex justify-between">
                                        <span class="text-gray-600 dark:text-gray-300">VOI Balance:</span>
                                        <span class="text-gray-900 dark:text-white font-medium">
                                            {(recipientInfo.balance / 1e6).toLocaleString()} VOI
                                        </span>
                                    </div>
                                    {#if !isNativeToken(token)}
                                        <div class="flex justify-between">
                                            <span class="text-gray-600 dark:text-gray-300">{token.symbol} Balance:</span>
                                            <span class="text-gray-900 dark:text-white font-medium">
                                            {((recipientInfo.assetBalance ?? 0) / Math.pow(10, token.decimals)).toLocaleString()} {token.symbol}
                                            </span>
                                        </div>
                                    {/if}
                                    <div class="flex justify-between">
                                        <span class="text-gray-600 dark:text-gray-300">Created:</span>
                                        <span class="text-gray-900 dark:text-white">{recipientInfo.createdAt}</span>
                                    </div>
                                    {#if !isARC200Token(token) && !isNativeToken(token)}
                                        <div class="flex justify-between items-center">
                                            <span class="text-gray-600 dark:text-gray-300">Asset Status:</span>
                                            {#if recipientInfo.hasOptedIn}
                                                <span class="text-green-600 dark:text-green-400 flex items-center gap-1">
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                                    </svg>
                                                    Opted In
                                                </span>
                                            {:else}
                                                <span class="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                                                    </svg>
                                                    Not Opted In
                                                </span>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>

                <div class="text-left">
                    <Label for="amount">Amount ({token.symbol})</Label>
                    <div class="relative">
                        <Input
                            id="amount"
                            type="number"
                            bind:value={amount}
                            min="0"
                            max={maxAmount}
                            step="any"
                            placeholder="Enter amount"
                        />
                        <button
                            type="button"
                            class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-400 pr-6"
                            on:click={() => amount = maxAmount.toString()}
                        >
                            MAX
                        </button>
                    </div>
                    <p class="text-sm text-gray-500 mt-1">
                        Available: {maxAmount} {token.symbol}
                    </p>
                </div>

                {#if !isARC200Token(token)}
                    <div class="text-left">
                        <Label for="note">Note (Optional)</Label>
                        <div class="relative">
                            <Input
                                id="note"
                                type="text"
                                bind:value={note}
                                maxlength={1000}
                                placeholder="Add an optional note to this transaction"
                            />
                            {#if note}
                                <div class="absolute right-2 top-1/2 -translate-y-1/2">
                                    <span class="text-xs text-gray-500 dark:text-gray-400">
                                        {note.length}/1000
                                    </span>
                                </div>
                            {/if}
                        </div>
                        <p class="text-sm text-gray-500 mt-1">
                            This note will be publicly visible on the blockchain
                        </p>
                    </div>
                {/if}
                
                {#if error}
                    <div class="p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg text-sm">
                        {error}
                    </div>
                {/if}

                <div class="flex justify-center gap-4 pt-2">
                    <Button 
                        color="blue" 
                        on:click={handleSend}
                        disabled={!canSubmit}
                    >
                        {#if isSending}
                            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Sending...
                        {:else}
                            Send
                        {/if}
                    </Button>
                    <Button color="alternative" on:click={handleClose}>Cancel</Button>
                </div>
            </div>
        {:else}
            <div class="space-y-4">
                <div class="p-4 bg-green-100 dark:bg-green-900 rounded-lg">
                    <div class="flex items-center justify-center mb-2">
                        <svg class="h-8 w-8 text-green-700 dark:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <p class="text-green-700 dark:text-green-300 font-medium mb-2">
                        Successfully sent {amount} {token.symbol}
                    </p>
                    {#if note}
                        <p class="text-sm text-green-600 dark:text-green-400 mb-2">
                            Note: {note}
                        </p>
                    {/if}
                    <div class="text-sm text-green-600 dark:text-green-400">
                        <p class="mb-2">Transaction ID:</p>
                        <div class="flex items-center justify-center gap-2 font-mono p-2">
                            <a 
                                href={`https://explorer.voi.network/explorer/transaction/${transactionId}`} 
                                target="_blank" 
                                class="hover:text-green-800 dark:hover:text-green-200 truncate"
                                title={transactionId}
                            >
                                {transactionId?.slice(0, 8)}...{transactionId?.slice(-8)}
                            </a>
                            <CopyComponent 
                                text={transactionId || ''}
                                toastMessage="Transaction ID copied to clipboard"
                                failureMessage="Failed to copy transaction ID"
                            />
                        </div>
                    </div>
                </div>

                <div class="flex justify-center gap-4">
                    <Button color="alternative" on:click={handleClose}>Close</Button>
                    <a 
                        href={`https://explorer.voi.network/explorer/transaction/${transactionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Button color="blue">View in Explorer</Button>
                    </a>
                </div>
            </div>
        {/if}
    </div>
</Modal>

<style>
    :global(.overflow-visible) {
        overflow: visible !important;
    }
    :global(.overflow-visible > div) {
        overflow: visible !important;
    }
    :global(.overflow-visible > div > div) {
        overflow: visible !important;
    }
</style> 