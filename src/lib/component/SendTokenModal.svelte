<script lang="ts">
    import { Modal, Button, Input, Label, Textarea } from 'flowbite-svelte';
    import { signTransactions, selectedWallet, signAndSendTransactions } from 'avm-wallet-svelte';
    import { algodClient, algodIndexer } from '$lib/utils/algod';
    import algosdk from 'algosdk';
    import type { FungibleTokenType } from '$lib/types/assets';
    import WalletSearch from './WalletSearch.svelte';
    import { arc200 as Contract } from 'ulujs';
    import CopyComponent from '$lib/component/ui/CopyComponent.svelte';

    // Click outside action
    function clickOutside(node: HTMLElement, callback: () => void) {
        const handleClick = (event: MouseEvent) => {
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
    let showAdvancedDetails = false;
    let currentTxnGroup = 0;
    let totalTxnGroups = 0;
    let transactionGroups: algosdk.Transaction[][] = [];
    let transactionIds: string[] = [];
    let showAmountMenu = false;
    let amountToDistribute = '';
    let showDistributionOptions = false;
    let hasCompletedTransaction = false;

    $: maxAmount = token.balance / Math.pow(10, token.decimals);
    $: totalAmount = recipients.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
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

        const resp = await contract.arc200_transfer(recipientAddress, BigInt(amount), true, false);

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
                    const amount = Number(recipient.amount) * Math.pow(10, token.decimals);
                    const txns = await buildARC200Transaction(recipient.address, amount);
                    groupTransactions.push(...txns);
                }
            } else {
                // Get fresh suggested params for non-ARC200 tokens
                const suggestedParams = await algodClient.getTransactionParams().do();
                
                for (const recipient of recipients) {
                    if (!recipient.address || !recipient.amount) continue;
                    const amount = Number(recipient.amount) * Math.pow(10, token.decimals);
                    
                    let txn;
                    if (isNativeToken(token)) {
                        txn = await buildVOITransaction(recipient.address, amount, suggestedParams);
                    } else {
                        txn = await buildVSATransaction(recipient.address, amount, suggestedParams);
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
            for (let i = 0; i < allSignedGroups.length; i++) {
                currentTxnGroup = i;
                const response = await algodClient.sendRawTransaction(allSignedGroups[i]).do();
                await algosdk.waitForConfirmation(algodClient, response.txId, 4);
                transactionIds.push(response.txId);
            }

            transactionId = transactionIds.join(',');
            success = true;
            hasCompletedTransaction = true;
            txState = 'idle';

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
        showAdvancedDetails = false;
        currentTxnGroup = 0;
        totalTxnGroups = 0;
        transactionGroups = [];
        transactionIds = [];
        hasCompletedTransaction = false;
    }

    function clearAllRecipients() {
        recipients = [{ address: null, amount: '', info: null, isLoading: false, isValid: false }];
        error = null;
    }

    function combineDuplicateRecipients() {
        const combined = recipients.reduce((acc, curr) => {
            if (!curr.address || !curr.amount) return acc;
            
            const existing = acc.find(r => r.address === curr.address);
            if (existing) {
                // Add amounts together
                const newAmount = (Number(existing.amount) + Number(curr.amount)).toString();
                existing.amount = newAmount;
                return acc;
            }
            
            return [...acc, curr];
        }, [] as Recipient[]);

        // If we found and combined any duplicates, update the recipients
        if (combined.length < recipients.length) {
            recipients = combined;
            error = null;
        }
    }

    function setAmountForAllRecipients(amount: string) {
        recipients = recipients.map(recipient => ({
            ...recipient,
            amount: amount
        }));
    }

    function distributeAmount(type: 'even' | 'max') {
        if (!isValidAmount) return;
        if (type === 'even' && !canSplitEvenly) return;
        if (type === 'max' && !canMaxEach) return;
        
        const amount = Number(amountToDistribute);
        if (type === 'even') {
            const splitAmount = (amount / recipients.length).toFixed(6);
            setAmountForAllRecipients(splitAmount);
        } else {
            setAmountForAllRecipients(amountToDistribute);
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

    function detectDelimiter(content: string): string {
        const lines = content.trim().split('\n');
        if (lines.length === 0) return ',';

        const firstLine = lines[0];
        if (firstLine.includes('\t')) return '\t';
        if (firstLine.includes(',')) return ',';
        if (firstLine.includes(';')) return ';';
        return ' ';
    }

    function parseAddressesAndAmounts(content: string) {
        const delimiter = detectDelimiter(content);
        const lines = content.trim().split('\n');
        const newRecipients: Recipient[] = [];
        
        for (const line of lines) {
            if (!line.trim()) continue;
            
            const [address, amount] = line.split(delimiter).map(s => s.trim());
            
            if (!address || !algosdk.isValidAddress(address)) {
                throw new Error(`Invalid address found: ${address}`);
            }

            newRecipients.push({
                address,
                amount: amount || '',
                info: null,
                isLoading: false,
                isValid: false
            });
        }

        if (newRecipients.length === 0) {
            throw new Error('No valid entries found');
        }

        if (newRecipients.length > 50) {
            throw new Error('Maximum of 50 recipients allowed');
        }

        return newRecipients;
    }

    // Add paste handler function
    async function handlePasteEvent(event: ClipboardEvent) {
        const content = event.clipboardData?.getData('text');
        if (!content) return;

        try {
            const newRecipients = parseAddressesAndAmounts(content);
            
            // If we already have one empty recipient, remove it
            if (recipients.length === 1 && !recipients[0].address) {
                recipients = newRecipients;
            } else {
                // Otherwise append new recipients up to the maximum
                const combinedRecipients = [...recipients, ...newRecipients];
                if (combinedRecipients.length > 50) {
                    throw new Error('Maximum of 50 recipients allowed');
                }
                recipients = combinedRecipients;
            }

            // Fetch info for all new recipients
            await Promise.all(
                newRecipients.map((_, index) => {
                    const recipientIndex = recipients.length - newRecipients.length + index;
                    return recipients[recipientIndex].address && 
                           fetchRecipientInfo(recipients[recipientIndex].address!, recipientIndex);
                })
            );

            error = null;
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to parse addresses';
        }
    }

    // Helper function to determine if token is native VOI
    function isNativeToken(token: any): boolean {
        return token.type === 'native';
    }

    // Helper function to determine if token is ARC-200
    function isARC200Token(token: any): boolean {
        return token.type === 'arc200';
    }

    function handleKeydown(event: KeyboardEvent) {
        // Only handle paste when not in an input field
        if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
            if (event.key === 'v' && (event.ctrlKey || event.metaKey)) {
                navigator.clipboard.readText().then(text => {
                    const mockEvent = new ClipboardEvent('paste', {
                        clipboardData: new DataTransfer()
                    });
                    Object.defineProperty(mockEvent.clipboardData, 'getData', {
                        value: () => text
                    });
                    handlePasteEvent(mockEvent);
                });
            }
        }
    }

    // Add this function to handle paste events on input fields
    async function handleInputPaste(event: ClipboardEvent, index: number) {
        // Only process if there's a tab or newline, indicating a structured paste
        const content = event.clipboardData?.getData('text');
        if (!content || (!content.includes('\t') && !content.includes('\n'))) {
            return; // Let the default paste behavior handle single values
        }

        event.preventDefault(); // Prevent default paste for structured data
        
        try {
            const newRecipients = parseAddressesAndAmounts(content);
            
            // Replace current recipient and add the rest
            recipients = [
                ...recipients.slice(0, index),
                ...newRecipients,
                ...recipients.slice(index + 1)
            ];

            // Fetch info for all new recipients
            await Promise.all(
                newRecipients.map((recipient, i) => {
                    const recipientIndex = index + i;
                    return recipient.address && 
                           fetchRecipientInfo(recipient.address, recipientIndex);
                })
            );

            error = null;
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to parse pasted data';
        }
    }
</script>

<svelte:window on:keydown={handleKeydown}/>

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
                            <Button 
                                size="xs" 
                                color="light" 
                                on:click={combineDuplicateRecipients}
                                disabled={recipients.length <= 1}
                            >
                                <i class="fas fa-compress-alt mr-1"></i>
                                Combine Duplicates
                            </Button>
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
                                                    step="any"
                                                    placeholder={`Amount in ${token.symbol}`}
                                                    size="sm"
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
                            <Button 
                                size="xs" 
                                color="light" 
                                on:click={async () => {
                                    try {
                                        const text = await navigator.clipboard.readText();
                                        const mockEvent = new ClipboardEvent('paste', {
                                            clipboardData: new DataTransfer()
                                        });
                                        Object.defineProperty(mockEvent.clipboardData, 'getData', {
                                            value: () => text
                                        });
                                        handlePasteEvent(mockEvent);
                                    } catch (err) {
                                        error = 'Failed to read clipboard. Please try again.';
                                    }
                                }}
                            >
                                <i class="fas fa-paste mr-1"></i>
                                Paste
                            </Button>
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
                                                    on:paste={(e) => {
                                                        if (e instanceof ClipboardEvent) {
                                                            handleInputPaste(e, index);
                                                        }
                                                    }}
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
                                                        step="any"
                                                        placeholder={`${token.symbol}`}
                                                        class="!pr-14"
                                                        on:paste={(e) => {
                                                            if (e instanceof ClipboardEvent) {
                                                                handleInputPaste(e, index);
                                                            }
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
                                    disabled={recipients.length >= 50}
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