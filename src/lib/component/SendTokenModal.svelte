<script lang="ts">
    import { Modal, Button, Input, Label } from 'flowbite-svelte';
    import { signTransactions, selectedWallet } from 'avm-wallet-svelte';
    import { algodClient, algodIndexer } from '$lib/utils/algod';
    import algosdk from 'algosdk';
    import type { FungibleTokenType } from '$lib/types/assets';
    import WalletSearch from './WalletSearch.svelte';
    import { arc200 as Contract } from 'ulujs';
    import CopyComponent from '$lib/component/ui/CopyComponent.svelte';
    import ImportRecipientsModal from './ImportRecipientsModal.svelte';
    
    // Click outside action
    function clickOutside(node: HTMLElement, callback: () => void) {
        const handleClick = (event: MouseEvent) => {
            // Don't close if clicking inside the import modal
            const importModal = document.querySelector('[data-modal-import]');
            if (importModal && importModal.contains(event.target as Node)) {
                return;
            }

            if (node && !node.contains(event.target as Node) && !event.defaultPrevented) {
                callback();
            }
        };

        document.addEventListener('click', handleClick, true);

        return {
            destroy() {
                document.removeEventListener('click', handleClick, true);
            },
            update(newCallback: () => void) {
                callback = newCallback;
            }
        };
    }

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

    interface Recipient {
        address: string | null;
        amount: string;
        info: {
            balance: number;
            createdAt: string;
            hasOptedIn: boolean;
            assetBalance?: number;
        } | null;
        isLoading: boolean;
        isValid: boolean;
    }

    let recipients: Recipient[] = [{ address: null, amount: '', info: null, isLoading: false, isValid: false }];
    let isSending = false;
    let txState: 'idle' | 'building' | 'awaiting' | 'sending' = 'idle';
    let error: string | null = null;
    let success = false;
    let transactionId: string | null = null;
    let note: string = '';
    let currentTxnGroup = 0;
    let totalTxnGroups = 0;
    let transactionGroups: algosdk.Transaction[][] = [];
    let transactionIds: string[] = [];
    let showAmountMenu = false;
    let amountToDistribute = '';
    let hasCompletedTransaction = false;
    let showImportModal = false;
    let pasteContent = '';
    let showCombineOptions = false;
    let failedRecipients: Recipient[] = [];
    let showRetryButton = false;

    function enforceDecimals(value: string | number, decimals: number): string {
        if (!value) return '';
        
        // Convert to string and remove any existing decimal places
        const strValue = value.toString();
        const [whole, fraction = ''] = strValue.split('.');
        
        // If no decimals, return the whole number
        if (decimals === 0) return whole;
        
        // Truncate fraction to max decimals
        const truncatedFraction = fraction.slice(0, decimals);
        
        // Return formatted number with correct decimals
        return truncatedFraction ? `${whole}.${truncatedFraction}` : whole;
    }

    $: maxAmount = Number(enforceDecimals(token.balance / Math.pow(10, token.decimals), token.decimals));
    $: totalAmount = Number(enforceDecimals(
        recipients.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
        token.decimals
    ));
    $: isValidTotalAmount = totalAmount > 0 && totalAmount <= maxAmount;
    $: canSubmit = recipients.every(r => {
        // Basic validation for all token types
        const basicValidation = r.address && r.amount && r.isValid;
        if (!basicValidation) return false;

        // Additional validation for VSA (non-native, non-ARC200 tokens)
        if (!isNativeToken(token) && !isARC200Token(token)) {
            // Check if recipient has opted in
            return r.info?.hasOptedIn === true;
        }

        return true;
    }) && isValidTotalAmount && !isSending;

    $: isValidAmount = amountToDistribute && Number(amountToDistribute) > 0;
    $: canSplitEvenly = isValidAmount && Number(amountToDistribute) <= maxAmount;
    $: canMaxEach = isValidAmount && (Number(amountToDistribute) * recipients.length) <= maxAmount;
    $: totalRequiredForMax = isValidAmount ? Number(amountToDistribute) * recipients.length : 0;

    function addRecipient() {
        recipients = [...recipients, { address: null, amount: '', info: null, isLoading: false, isValid: false }];
    }

    function removeRecipient(index: number) {
        recipients = recipients.filter((_, i) => i !== index);
    }

    async function fetchRecipientInfo(address: string, index: number) {
        recipients[index].isLoading = true;
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

            recipients[index].info = {
                balance: account.amount,
                createdAt: new Date(block.timestamp * 1000).toLocaleDateString(),
                hasOptedIn,
                assetBalance
            };

            recipients[index].isValid = true;
            error = null;
        } catch (err) {
            console.error('Error fetching recipient info:', err);
            error = 'Failed to fetch recipient info. Please try again later.';
            recipients[index].info = null;
            recipients[index].isValid = false;
        } finally {
            recipients[index].isLoading = false;
        }
    }

    async function handleRecipientSelected(address: string, index: number) {
        if (address === recipients[index].address) return;
        if (address === '') {
            recipients[index] = {
                ...recipients[index],
                address: null,
                info: null,
                isValid: false
            };
            return;
        }
        recipients[index].address = address;
        error = null;
        await fetchRecipientInfo(address, index);
    }

    async function buildVSATransaction(recipientAddress: string, amount: number, suggestedParams: algosdk.SuggestedParams): Promise<algosdk.Transaction> {
        if (!$selectedWallet?.address) {
            throw new Error('Wallet not connected');
        }
        return algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: $selectedWallet.address,
            to: recipientAddress,
            assetIndex: Number(token.id),
            amount: Math.floor(amount),
            note: note ? new TextEncoder().encode(note) : undefined,
            suggestedParams
        });
    }

    async function buildARC200Transaction(recipientAddress: string, amount: number, useGroupID: boolean = true): Promise<algosdk.Transaction[]> {
        if (!$selectedWallet?.address) {
            throw new Error('Wallet not connected');
        }

        const contract = new Contract(Number(token.id), algodClient, algodIndexer, {
            acc: {
                addr: $selectedWallet.address,
                sk: new Uint8Array()
            }
        });

        const resp = await contract.arc200_transfer(recipientAddress, BigInt(Math.floor(amount)), true, false);

        if (!resp.success) {
            throw new Error('Failed to build ARC-200 transaction');
        }
        
        // Check if we have transaction data
        if (!('txns' in resp) || !resp.txns || !resp.txns.length) {
            throw new Error('No transactions returned from ARC-200 contract');
        }

        const decodedTxns: algosdk.Transaction[] = [];

        // Decode all transactions from the simulation response
        for (const txn of resp.txns) {
            const bytes = Buffer.from(txn, 'base64');
            const tx = algosdk.decodeUnsignedTransaction(bytes);
            delete tx.group;
            decodedTxns.push(tx);
        }

        return decodedTxns;
    }

    async function buildVOITransaction(recipientAddress: string, amount: number, suggestedParams: algosdk.SuggestedParams): Promise<algosdk.Transaction> {
        if (!$selectedWallet?.address) {
            throw new Error('Wallet not connected');
        }
        return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: $selectedWallet.address,
            to: recipientAddress,
            amount: Math.floor(amount),
            note: note ? new TextEncoder().encode(note) : undefined,
            suggestedParams
        });
    }

    async function handleSend() {
        if (!$selectedWallet?.address) {
            error = 'Please connect your wallet first';
            return;
        }

        const invalidRecipients = recipients.filter(r => !r.address || !algosdk.isValidAddress(r.address));
        if (invalidRecipients.length > 0) {
            error = 'Invalid recipient address(es)';
            return;
        }

        try {
            isSending = true;
            txState = 'building';
            error = null;
            transactionGroups = [];
            transactionIds = [];
            currentTxnGroup = 0;
            const groupTransactions: algosdk.Transaction[] = [];
            
            // Handle ARC-200 tokens
            if (isARC200Token(token)) {
                // First pass: collect all transactions
                for (const recipient of recipients) {
                    if (!recipient.address || !recipient.amount) continue;
                    // Convert amount to raw units with proper decimal precision
                    const rawAmount = Math.floor(Number(enforceDecimals(recipient.amount, token.decimals)) * Math.pow(10, token.decimals));
                    const txns = await buildARC200Transaction(recipient.address, rawAmount);
                    groupTransactions.push(...txns);
                }
            } else {
                // Get fresh suggested params for non-ARC200 tokens
                const suggestedParams = await algodClient.getTransactionParams().do();
                
                for (const recipient of recipients) {
                    if (!recipient.address || !recipient.amount) continue;
                    // Convert amount to raw units with proper decimal precision
                    const rawAmount = Math.floor(Number(enforceDecimals(recipient.amount, token.decimals)) * Math.pow(10, token.decimals));
                    
                    let txn;
                    if (isNativeToken(token)) {
                        txn = await buildVOITransaction(recipient.address, rawAmount, suggestedParams);
                    } else {
                        txn = await buildVSATransaction(recipient.address, rawAmount, suggestedParams);
                    }
                    delete txn.group;
                    groupTransactions.push(txn);
                }
            }

            // Split transactions into groups of 16
            for (let i = 0; i < groupTransactions.length; i += 16) {
                const group = groupTransactions.slice(i, i + 16);
                transactionGroups.push(algosdk.assignGroupID(group));
            }

            totalTxnGroups = transactionGroups.length;
            
            // First collect all signatures
            txState = 'awaiting';
            const allSignedGroups: Uint8Array[][] = [];
            
            for (let i = 0; i < transactionGroups.length; i++) {
                currentTxnGroup = i;
                const signedGroup = await signTransactions([transactionGroups[i]]);
                if (!signedGroup) {
                    throw new Error('User rejected transaction signing');
                }
                allSignedGroups.push(signedGroup);
            }

            // Then send all transactions
            txState = 'sending';
            try {
                const sendPromises = allSignedGroups.map(async (signedGroup, index) => {
                    try {
                        currentTxnGroup = index;
                        const response = await algodClient.sendRawTransaction(signedGroup).do();
                        const confirmedTxn = await algosdk.waitForConfirmation(algodClient, response.txId, 4);
                        return {
                            success: true,
                            txId: response.txId,
                            confirmedTxn
                        };
                    } catch (err) {
                        return {
                            success: false,
                            txId: null,
                            error: err instanceof Error ? err.message : 'Unknown error occurred',
                            groupIndex: index
                        };
                    }
                });

                const results = await Promise.all(sendPromises);
                
                // Process results and collect successful/failed transactions
                const successfulTxns = results.filter(r => r.success).map(r => r.txId!);
                const failedTxns = results.filter(r => !r.success);

                if (failedTxns.length > 0) {
                    // Store failed recipients for potential retry
                    failedRecipients = failedTxns.map(f => recipients[f.groupIndex ?? 0]);
                    showRetryButton = true;
                    
                    // Some transactions failed
                    if (successfulTxns.length > 0) {
                        // Partial success - some txns went through
                        transactionIds = successfulTxns;
                        error = `${failedTxns.length} transaction group(s) failed. Group(s) ${failedTxns.map(f => (f.groupIndex ?? 0) + 1).join(', ')} failed with error: ${failedTxns[0].error}`;
                        success = true; // Still show success screen but with error message
                    } else {
                        // All transactions failed
                        throw new Error(`All transactions failed. First error: ${failedTxns[0].error}`);
                    }
                } else {
                    // All transactions succeeded
                    transactionIds = successfulTxns;
                    success = true;
                    showRetryButton = false;
                    failedRecipients = [];
                }

                transactionId = transactionIds.join(',');
                hasCompletedTransaction = true;
                txState = 'idle';

            } catch (err) {
                console.error('Error sending tokens:', err);
                error = err instanceof Error ? err.message : 'Failed to send tokens. Please try again.';
                isSending = false;
                txState = 'idle';
            }

        } catch (err) {
            console.error('Error sending tokens:', err);
            error = err instanceof Error ? err.message : 'Failed to send tokens. Please try again.';
            isSending = false;
            txState = 'idle';
        }
    }

    function resetState() {
        recipients = [{ address: null, amount: '', info: null, isLoading: false, isValid: false }];
        error = null;
        success = false;
        isSending = false;
        transactionId = null;
        note = '';
        currentTxnGroup = 0;
        totalTxnGroups = 0;
        transactionGroups = [];
        transactionIds = [];
        hasCompletedTransaction = false;
        failedRecipients = [];
        showRetryButton = false;
    }

    function clearAllRecipients() {
        recipients = [{ address: null, amount: '', info: null, isLoading: false, isValid: false }];
        error = null;
    }

    function hasDuplicateRecipients(): boolean {
        const addresses = recipients
            .filter(r => r.address)
            .map(r => r.address);
        return addresses.length !== new Set(addresses).size;
    }

    function combineRecipients(method: 'sum' | 'max' | 'min') {
        const combined = recipients.reduce((acc, curr) => {
            if (!curr.address || !curr.amount) return acc;
            
            const existing = acc.find(r => r.address === curr.address);
            if (existing) {
                const currentAmount = Number(curr.amount);
                const existingAmount = Number(existing.amount);
                
                let newAmount: number;
                switch (method) {
                    case 'sum':
                        newAmount = existingAmount + currentAmount;
                        break;
                    case 'max':
                        newAmount = Math.max(existingAmount, currentAmount);
                        break;
                    case 'min':
                        newAmount = Math.min(existingAmount, currentAmount);
                        break;
                }
                
                existing.amount = enforceDecimals(newAmount, token.decimals);
                return acc;
            }
            
            return [...acc, { ...curr, amount: enforceDecimals(curr.amount, token.decimals) }];
        }, [] as Recipient[]);

        // If we found and combined any duplicates, update the recipients
        if (combined.length < recipients.length) {
            recipients = combined;
            error = null;
        }
        showCombineOptions = false;
    }

    function setAmountForAllRecipients(amount: string) {
        recipients = recipients.map(recipient => ({
            ...recipient,
            amount: enforceDecimals(amount, token.decimals)
        }));
    }

    function distributeAmount(type: 'even' | 'max') {
        if (!isValidAmount) return;
        if (type === 'even' && !canSplitEvenly) return;
        if (type === 'max' && !canMaxEach) return;
        
        const amount = Number(amountToDistribute);
        if (type === 'even') {
            const splitAmount = enforceDecimals(amount / recipients.length, token.decimals);
            setAmountForAllRecipients(splitAmount);
        } else {
            setAmountForAllRecipients(enforceDecimals(amountToDistribute, token.decimals));
        }
        showAmountMenu = false;
        amountToDistribute = '';
    }

    function handleClose() {
        if (hasCompletedTransaction) {
            onTokenSent();
        }
        resetState();
        open = false;
    }

    function handlePasteModalConfirm(importedRecipients: Recipient[]) {
        // If we already have one empty recipient, remove it
        if (recipients.length === 1 && !recipients[0].address) {
            recipients = importedRecipients;
        } else {
            // Otherwise append new recipients up to the maximum
            const combinedRecipients = [...recipients, ...importedRecipients];
            recipients = combinedRecipients;
        }

        // Fetch info for all new recipients
        Promise.all(
            importedRecipients.map((_, index) => {
                const recipientIndex = recipients.length - importedRecipients.length + index;
                return recipients[recipientIndex].address && 
                       fetchRecipientInfo(recipients[recipientIndex].address!, recipientIndex);
            })
        );

        error = null;
    }

    // Helper function to determine if token is native VOI
    function isNativeToken(token: any): boolean {
        return token.type === 'native';
    }

    // Helper function to determine if token is ARC-200
    function isARC200Token(token: any): boolean {
        return token.type === 'arc200';
    }

    function handleRetryFailedTransactions() {
        // Reset success state but keep the note
        const currentNote = note;
        resetState();
        // Populate the recipients list with failed transactions
        recipients = failedRecipients;
        note = currentNote;
        // Reset failed recipients list
        failedRecipients = [];
        showRetryButton = false;
        success = false;
    }
</script>

<Modal bind:open size="lg" on:close={handleClose} class="overflow-visible max-h-[calc(100vh-2rem)]">
    <div class="max-w-3xl mx-auto flex flex-col max-h-[calc(100vh-6rem)]">
        <div class="flex-none">
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white">Send {token.symbol}</h3>
                <div class="text-sm text-gray-600 dark:text-gray-400">
                    Available: {maxAmount.toLocaleString()} {token.symbol}
                </div>
            </div>
        </div>
        
        {#if !success}
            <div class="flex flex-col flex-1 min-h-0">
                <div class="flex-none space-y-6">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-medium">Recipients</h3>
                        <div class="flex gap-2">
                            <div class="relative" use:clickOutside={() => showCombineOptions = false}>
                                <Button 
                                    size="xs" 
                                    color={hasDuplicateRecipients() ? "blue" : "light"}
                                    on:click={() => showCombineOptions = !showCombineOptions}
                                    disabled={recipients.length <= 1 || !hasDuplicateRecipients()}
                                    class={hasDuplicateRecipients() ? "animate-pulse" : ""}
                                >
                                    <i class="fas fa-compress-alt mr-1"></i>
                                    Combine Duplicates
                                </Button>
                                {#if showCombineOptions}
                                    <div class="absolute left-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                                        <div class="py-1">
                                            <button
                                                class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                on:click={() => combineRecipients('sum')}
                                            >
                                                <i class="fas fa-plus-circle mr-2"></i>
                                                Combine Amounts
                                            </button>
                                            <button
                                                class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                on:click={() => combineRecipients('max')}
                                            >
                                                <i class="fas fa-arrow-up mr-2"></i>
                                                Use Highest Amount
                                            </button>
                                            <button
                                                class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                on:click={() => combineRecipients('min')}
                                            >
                                                <i class="fas fa-arrow-down mr-2"></i>
                                                Use Lowest Amount
                                            </button>
                                        </div>
                                    </div>
                                {/if}
                            </div>
                            <Button 
                                size="xs" 
                                color="light" 
                                on:click={clearAllRecipients}
                                disabled={recipients.length <= 1 && !recipients[0].address}
                            >
                                <i class="fas fa-trash-alt mr-1"></i>
                                Clear All
                            </Button>
                            <div class="relative" use:clickOutside={() => {
                                showAmountMenu = false;
                                amountToDistribute = '';
                            }}>
                                <Button 
                                    size="xs" 
                                    color="light"
                                    on:click={() => showAmountMenu = !showAmountMenu}
                                >
                                    <i class="fas fa-coins mr-1"></i>
                                    Set All Amounts
                                </Button>
                                {#if showAmountMenu}
                                    <div class="absolute right-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                                        <div class="p-3 space-y-3">
                                            <div>
                                                <Label class="mb-2 text-sm">Amount to distribute:</Label>
                                                <Input
                                                    type="number"
                                                    bind:value={amountToDistribute}
                                                    min="0"
                                                    max={maxAmount}
                                                    step={`${1/Math.pow(10, token.decimals)}`}
                                                    placeholder={`Amount in ${token.symbol}`}
                                                    size="sm"
                                                    on:input={(e: Event) => {
                                                        const input = e.target as HTMLInputElement;
                                                        amountToDistribute = enforceDecimals(input.value, token.decimals);
                                                    }}
                                                />
                                                {#if amountToDistribute && Number(amountToDistribute) > maxAmount}
                                                    <p class="mt-1 text-xs text-red-500 dark:text-red-400">
                                                        Amount exceeds your balance
                                                    </p>
                                                {/if}
                                            </div>
                                            <div class="space-y-2">
                                                <Label class="text-sm">Distribution method:</Label>
                                                <button
                                                    class="w-full text-left px-3 py-2 text-sm rounded flex items-center justify-between transition-colors duration-150
                                                        {canSplitEvenly 
                                                            ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer' 
                                                            : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}"
                                                    on:click={() => distributeAmount('even')}
                                                    disabled={!canSplitEvenly}
                                                >
                                                    <span class="flex items-center">
                                                        <i class="fas fa-divide mr-2"></i>
                                                        Split Evenly
                                                    </span>
                                                    <span class="text-xs {canSplitEvenly ? 'text-gray-500' : 'text-gray-400 dark:text-gray-600'}">
                                                        {amountToDistribute && Number(amountToDistribute) > 0
                                                            ? (Number(amountToDistribute) / recipients.length).toFixed(6)
                                                            : '0'} each
                                                    </span>
                                                </button>
                                                <button
                                                    class="w-full text-left px-3 py-2 text-sm rounded flex items-center justify-between transition-colors duration-150
                                                        {canMaxEach 
                                                            ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer' 
                                                            : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}"
                                                    on:click={() => distributeAmount('max')}
                                                    disabled={!canMaxEach}
                                                >
                                                    <span class="flex items-center">
                                                        <i class="fas fa-arrow-up mr-2"></i>
                                                        Maximum Each
                                                    </span>
                                                    <span class="text-xs {canMaxEach ? 'text-gray-500' : 'text-gray-400 dark:text-gray-600'}">
                                                        {amountToDistribute || '0'} each
                                                        {#if isValidAmount && !canMaxEach}
                                                            <span class="block text-xs text-red-500">
                                                                Need {totalRequiredForMax} {token.symbol}
                                                            </span>
                                                        {/if}
                                                    </span>
                                                </button>
                                                {#if amountToDistribute && Number(amountToDistribute) > 0}
                                                    {#if !canMaxEach && !canSplitEvenly}
                                                        <p class="text-xs text-red-500 dark:text-red-400">
                                                            Insufficient balance for either distribution method
                                                        </p>
                                                    {/if}
                                                {/if}
                                            </div>
                                        </div>
                                    </div>
                                {/if}
                            </div>
                            <div class="relative" use:clickOutside={() => showImportModal = false}>
                                <Button 
                                    size="xs" 
                                    color="light"
                                    on:click={() => showImportModal = true}
                                >
                                    <i class="fas fa-file-import mr-1"></i>
                                    Import
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex-1 min-h-0 space-y-6 overflow-y-auto py-4">
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                        <!-- Header -->
                        <div class="grid grid-cols-[minmax(280px,420px),120px] gap-4 p-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-500 dark:text-gray-400">
                            <div>Recipient</div>
                            <div>Amount</div>
                        </div>

                        <!-- Recipients -->
                        <div class="divide-y divide-gray-200 dark:divide-gray-700 relative">
                            {#each recipients as recipient, index}
                                <div class="p-3 relative">
                                    {#if recipients.length > 1}
                                        <button
                                            class="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors duration-150"
                                            on:click={() => removeRecipient(index)}
                                            title="Remove recipient"
                                            aria-label="Remove recipient"
                                        >
                                            <i class="fas fa-times"></i>
                                        </button>
                                    {/if}
                                    <div class="flex-1 pr-8">
                                        <div class="grid grid-cols-[minmax(280px,420px),120px] gap-4">
                                            <!-- Recipient Column -->
                                            <div class="space-y-2">
                                                <WalletSearch
                                                    onSubmit={(addr) => handleRecipientSelected(addr, index)}
                                                    loadPreviousValue={false}
                                                    storeAddress={false}
                                                    clearOnSubmit={false}
                                                    hideSubmitButton={true}
                                                    searchText={recipient.address || ''}
                                                />
                                                <div 
                                                    class="relative" 
                                                >
                                                    {#if recipient.address}
                                                        {#if recipient.isLoading}
                                                            <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                                                <svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                </svg>
                                                                Loading account details...
                                                            </div>
                                                        {:else if recipient.info}
                                                            <div class="space-y-2">
                                                                <!-- Address with copy and explorer links -->
                                                                <div class="flex items-center gap-1.5">
                                                                    <span class="font-mono text-gray-900 dark:text-white">
                                                                        {recipient.address.slice(0, 8)}...{recipient.address.slice(-8)}
                                                                    </span>
                                                                    <div class="flex items-center gap-1">
                                                                        <button
                                                                            type="button"
                                                                            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                                                            aria-label="Copy address"
                                                                            on:click={() => {
                                                                                navigator.clipboard.writeText(recipient.address || '');
                                                                            }}
                                                                        >
                                                                            <i class="fas fa-copy text-xs"></i>
                                                                        </button>
                                                                        <a
                                                                            href={`https://explorer.voi.network/explorer/account/${recipient.address}`}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            aria-label="View on explorer"
                                                                            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                                                        >
                                                                            <i class="fas fa-external-link-alt text-xs"></i>
                                                                        </a>
                                                                    </div>
                                                                </div>

                                                                <!-- Balances and opt-in status -->
                                                                <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                                                                    <div class="flex items-center gap-2">
                                                                        <span class="text-xs text-gray-500 dark:text-gray-400">Balance:</span>
                                                                        <span class="text-sm text-gray-700 dark:text-gray-300">
                                                                            {(recipient.info.balance / 1e6).toLocaleString()} VOI
                                                                        </span>
                                                                    </div>
                                                                    
                                                                    {#if !isNativeToken(token)}
                                                                        <div class="flex items-center gap-2">
                                                                            <span class="text-xs text-gray-500 dark:text-gray-400">{token.symbol}:</span>
                                                                            <span class="text-sm text-gray-700 dark:text-gray-300">
                                                                                {((recipient.info.assetBalance ?? 0) / Math.pow(10, token.decimals)).toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                    {/if}

                                                                    {#if !isARC200Token(token) && !isNativeToken(token)}
                                                                        <div class="flex-shrink-0">
                                                                            {#if recipient.info.hasOptedIn}
                                                                                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                                                    <i class="fas fa-check-circle mr-1"></i>
                                                                                    Opted In
                                                                                </span>
                                                                            {:else}
                                                                                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                                                                    <i class="fas fa-exclamation-circle mr-1"></i>
                                                                                    Not Opted In
                                                                                </span>
                                                                            {/if}
                                                                        </div>
                                                                    {/if}
                                                                </div>
                                                            </div>
                                                        {/if}
                                                    {/if}
                                                </div>
                                            </div>

                                            <!-- Amount Column -->
                                            <div>
                                                <div class="relative">
                                                    <Input
                                                        type="number"
                                                        bind:value={recipient.amount}
                                                        min="0"
                                                        max={maxAmount}
                                                        step={`${1/Math.pow(10, token.decimals)}`}
                                                        placeholder={`${token.symbol}`}
                                                        class="!pr-14"
                                                        on:input={(e: Event) => {
                                                            const input = e.target as HTMLInputElement;
                                                            recipient.amount = enforceDecimals(input.value, token.decimals);
                                                        }}
                                                    />
                                                    {#if !recipient.amount || Number(recipient.amount) < maxAmount}
                                                        <button
                                                            type="button"
                                                            class="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded"
                                                            on:click={() => recipient.amount = maxAmount.toString()}
                                                        >
                                                            MAX
                                                        </button>
                                                    {/if}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            {/each}

                            <!-- Add Recipient Button -->
                            <div class="p-3 bg-gray-50 dark:bg-gray-900/50">
                                <Button 
                                    size="sm" 
                                    color="light" 
                                    on:click={addRecipient} 
                                    class="w-full"
                                >
                                    <i class="fas fa-plus mr-1"></i>
                                    Add Another Recipient
                                </Button>
                            </div>
                        </div>
                    </div>

                    {#if !isARC200Token(token)}
                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                            <Label for="note" class="mb-2">Note (Optional)</Label>
                            <div class="relative">
                                <Input
                                    id="note"
                                    type="text"
                                    bind:value={note}
                                    maxlength={1000}
                                    placeholder="Add an optional note to this transaction"
                                    class="pr-16"
                                />
                                {#if note}
                                    <div class="absolute right-2 top-1/2 -translate-y-1/2">
                                        <span class="text-xs text-gray-500 dark:text-gray-400">
                                            {note.length}/1000
                                        </span>
                                    </div>
                                {/if}
                            </div>
                            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                This note will be publicly visible on the blockchain
                            </p>
                        </div>
                    {/if}
                    
                    {#if error}
                        <div class="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <i class="fas fa-exclamation-circle"></i>
                                    <span>{error}</span>
                                </div>
                                <button
                                    type="button"
                                    class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                    on:click={() => error = null}
                                    title="Dismiss error"
                                    aria-label="Dismiss error"
                                >
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    {/if}
                </div>

                <div class="flex-none pt-4">
                    <div class="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div class="flex items-center gap-4 text-sm">
                            <div>
                                <span class="text-gray-500 dark:text-gray-400">Total Amount:</span>
                                <span class="ml-1 font-medium text-gray-900 dark:text-white">{totalAmount} {token.symbol}</span>
                            </div>
                            <div>
                                <span class="text-gray-500 dark:text-gray-400">Recipients:</span>
                                <span class="ml-1 font-medium text-gray-900 dark:text-white">{recipients.filter(r => r.address && r.amount).length}</span>
                            </div>
                        </div>
                        <div class="flex gap-3">
                            <Button color="alternative" on:click={handleClose}>Cancel</Button>
                            <Button 
                                color="blue" 
                                on:click={handleSend}
                                disabled={!canSubmit || txState !== 'idle'}
                            >
                                {#if txState === 'building'}
                                    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Building Txns...
                                {:else if txState === 'awaiting'}
                                    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Awaiting Signature {#if totalTxnGroups > 1}(Group {currentTxnGroup + 1} of {totalTxnGroups}){/if}
                                {:else if txState === 'sending'}
                                    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Sending {#if totalTxnGroups > 1}(Group {currentTxnGroup + 1} of {totalTxnGroups}){/if}
                                {:else}
                                    <i class="fas fa-paper-plane mr-2"></i>
                                    Send
                                {/if}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        {:else}
            <div class="space-y-6">
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-green-200 dark:border-green-800 p-6">
                    <div class="flex items-center justify-center mb-4">
                        <div class="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <svg class="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                        </div>
                    </div>
                    <div class="text-center">
                        <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                            Transaction Successful
                        </h4>
                        <p class="text-green-600 dark:text-green-400 mb-4">
                            Successfully sent {totalAmount} {token.symbol}
                        </p>
                        {#if note}
                            <div class="mb-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-md">
                                <p class="text-sm text-gray-600 dark:text-gray-400">
                                    Note: {note}
                                </p>
                            </div>
                        {/if}
                        <div class="text-sm">
                            <p class="text-gray-600 dark:text-gray-400 mb-2">Transaction ID{transactionIds.length > 1 ? 's' : ''}:</p>
                            <div class="flex flex-col items-center">
                                {#each transactionIds as txId}
                                    <div class="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/50 rounded-md font-mono">
                                        <a 
                                            href={`https://explorer.voi.network/explorer/transaction/${txId}`} 
                                            target="_blank" 
                                            class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                            title={txId}
                                        >
                                            {txId.slice(0, 8)}...{txId.slice(-8)}
                                        </a>
                                        <CopyComponent 
                                            text={txId}
                                            toastMessage="Transaction ID copied"
                                            failureMessage="Failed to copy transaction ID"
                                        />
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex justify-center gap-3">
                    <Button color="alternative" on:click={handleClose}>Close</Button>
                    {#if showRetryButton}
                        <Button color="red" on:click={handleRetryFailedTransactions}>
                            <i class="fas fa-redo mr-2"></i>
                            Retry Failed Transactions
                        </Button>
                    {/if}
                    <a 
                        href={`https://explorer.voi.network/explorer/transaction/${transactionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Button color="blue">
                            <i class="fas fa-external-link-alt mr-2"></i>
                            View in Explorer
                        </Button>
                    </a>
                </div>
            </div>
        {/if}
    </div>
</Modal>

{#if showImportModal}
    <ImportRecipientsModal
        bind:open={showImportModal}
        onClose={() => {
            showImportModal = false;
        }}
        onConfirm={(recipients) => {
            handlePasteModalConfirm(recipients);
            showImportModal = false;
        }}
    />
{/if}

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
    :global(.modal) {
        max-width: min(90vw, 48rem);
    }
    :global(.modal > div) {
        max-width: min(90vw, 48rem);
    }
    :global(input[type="number"]::-webkit-inner-spin-button),
    :global(input[type="number"]::-webkit-outer-spin-button) {
        -webkit-appearance: none;
        margin: 0;
    }
    
    :global(input[type="number"]) {
        -moz-appearance: textfield;
        appearance: textfield;
    }
</style> 