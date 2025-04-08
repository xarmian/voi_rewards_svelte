<script lang="ts">
    import { Modal, Button, Input, Label } from 'flowbite-svelte';
    import { signTransactions, selectedWallet } from 'avm-wallet-svelte';
    import { algodClient, algodIndexer } from '$lib/utils/algod';
    import algosdk from 'algosdk';
    import type { FungibleTokenType } from '$lib/types/assets';
    import { arc200 as Contract } from 'ulujs';
    import CopyComponent from '$lib/component/ui/CopyComponent.svelte';
    import ImportRecipientsModal from './ImportRecipientsModal.svelte';
    import { fungibleTokens as fungibleTokensStore } from '$lib/stores/tokens';
    import RecipientRow from './RecipientRow.svelte';
    import type { Recipient } from '$lib/types/recipients';
    
    // Constants for Algorand transaction limits
    const MAX_TXN_PER_GROUP = 16;
    const MAX_GROUPS_PER_SIGNING = 16;

    // Helper function to check if a token is an LP token
    function isLPToken(token: FungibleTokenType) {
        return 'poolInfo' in token && token.poolInfo !== undefined;
    }

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

    let availableTokens: FungibleTokenType[] = [];
    let selectedToken = token;
    let tokenImages = new Map<string, string>();
    let isInitialLoad = true;
    let notice: string | null = null;

    // Create the native VOI token object with proper initialization
    let nativeVoiToken: FungibleTokenType = {
        id: '0',
        name: 'Voi',
        symbol: 'VOI',
        decimals: 6,
        balance: isNativeToken(token) ? token.balance : 0,
        verified: true,
        imageUrl: `https://asset-verification.nautilus.sh/icons/0.png`,
        value: isNativeToken(token) ? token.balance / 1e6 : 0,
        type: 'native'
    };

    // Fetch VOI balance only on initial modal open
    $: if (open && $selectedWallet?.address && isInitialLoad) {
        isInitialLoad = false;
        algodClient.accountInformation($selectedWallet.address).do()
            .then(info => {
                nativeVoiToken = {
                    ...nativeVoiToken,
                    balance: info.amount,
                    value: info.amount / 1e6
                };
                // If the selected token is native VOI, update it too
                if (isNativeToken(selectedToken)) {
                    selectedToken = {
                        ...selectedToken,
                        balance: info.amount
                    };
                }
                // Force Svelte reactivity for available tokens
                availableTokens = [nativeVoiToken, ...availableTokens.filter(t => t.id !== '0')];
            })
            .catch(console.error);
    }

    // Reset isInitialLoad when modal closes
    $: if (!open) {
        isInitialLoad = true;
    }

    // Subscribe to the fungible tokens store and ensure VOI is always present
    fungibleTokensStore.subscribe((tokens) => {
        const filteredTokens = tokens.filter(t => !isLPToken(t));
        // Keep the current VOI token with its balance when updating the list
        availableTokens = [nativeVoiToken, ...filteredTokens];
    });

    // Cache token images
    async function cacheTokenImage(token: FungibleTokenType) {
        const tokenId = token.id;
        if (!tokenId || tokenImages.has(tokenId)) return;
        
        try {
            const response = await fetch(`https://asset-verification.nautilus.sh/icons/${tokenId}.png`);
            if (!response.ok) return;
            
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
                tokenImages.set(tokenId, reader.result as string);
                tokenImages = tokenImages; // Trigger Svelte reactivity
            };
            reader.readAsDataURL(blob);
        } catch (error) {
            console.error('Error caching token image:', error);
        }
    }

    // Cache images for all tokens
    $: {
        availableTokens.forEach(token => {
            cacheTokenImage(token);
        });
    }

    // Initialize VOI image immediately
    $: if (open) {
        tokenImages.set('0', `https://asset-verification.nautilus.sh/icons/0.png`);
        tokenImages = tokenImages;
    }

    // Update the selected token when the token prop changes
    $: if (token) {
        selectedToken = token;
    }

    // Update maxAmount when selected token changes
    $: maxAmount = Number(enforceDecimals(selectedToken.balance / Math.pow(10, selectedToken.decimals), selectedToken.decimals));


    let recipients: Recipient[] = [{ address: null, amount: '', note: '', info: null, isLoading: false, isValid: false }];
    let isSending = false;
    let txState: 'idle' | 'building' | 'awaiting' | 'sending' = 'idle';
    let error: string | null = null;
    let success = false;
    let transactionId: string | null = null;
    let currentTxnGroup = 0;
    let totalTxnGroups = 0;
    let transactionGroups: algosdk.Transaction[][] = [];
    let transactionIds: string[] = [];
    let showAmountMenu = false;
    let amountToDistribute = '';
    let hasCompletedTransaction = false;
    let showImportModal = false;
    let showCombineOptions = false;
    let failedRecipients: Recipient[] = [];
    let showRetryButton = false;
    let showTokenSelect = false;
    let showNoteMenu = false;
    let noteForAll = '';

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

    $: totalAmount = Number(enforceDecimals(
        recipients.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
        selectedToken.decimals
    ));
    $: isValidTotalAmount = totalAmount > 0 && totalAmount <= maxAmount;
    $: canSubmit = recipients.every(r => {
        // Basic validation for all token types
        const basicValidation = r.address && r.amount && r.isValid;
        if (!basicValidation) return false;

        // Additional validation for VSA (non-native, non-ARC200 tokens)
        if (!isNativeToken(selectedToken) && !isARC200Token(selectedToken)) {
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
        recipients = [...recipients, { address: null, amount: '', note: '', info: null, isLoading: false, isValid: false }];
    }

    function removeRecipient(index: number) {
        recipients = recipients.filter((_, i) => i !== index);
    }

    async function fetchRecipientInfo(address: string, index: number) {
        recipients[index].isLoading = true;
        try {
            let accountInfo;
            let block;
            try {
                [accountInfo, block] = await Promise.all([
                    algodClient.accountInformation(address).do(),
                    algodIndexer.lookupAccountByID(address).do()
                        .then(info => algodIndexer.lookupBlock(info.account['created-at-round']).do())
                ]);
            } catch (err) {
                // If account info fails, set defaults
                accountInfo = { amount: 0, assets: [] };
                block = { timestamp: Date.now() / 1000 };
            }

            let assetBalance = 0;
            const hasOptedIn = isARC200Token(selectedToken) ? true : 
                accountInfo.assets?.some((asset: any) => {
                    if (asset['asset-id'] === Number(selectedToken.id)) {
                        assetBalance = asset.amount;
                        return true;
                    }
                    return false;
                }) ?? false;

            // For ARC-200 tokens, fetch balance using the contract
            if (isARC200Token(selectedToken)) {
                try {
                    const contract = new Contract(Number(selectedToken.id), algodClient, algodIndexer);
                    const balance = await contract.arc200_balanceOf(address);
                    if (balance.success) {
                        assetBalance = Number(balance.returnValue);
                    }
                } catch (err) {
                    assetBalance = 0;
                }
            }

            recipients[index].info = {
                balance: accountInfo.amount,
                createdAt: new Date(block.timestamp * 1000).toLocaleDateString(),
                hasOptedIn,
                assetBalance
            };

            recipients[index].isValid = true;
            error = null;
            notice = null;
        } catch (err) {
            console.error('Error fetching recipient info:', err);
            error = 'Failed to fetch recipient info. Please try again later.';
            recipients[index].info = null;
            recipients[index].isValid = false;
        } finally {
            recipients[index].isLoading = false;
            recipients = [...recipients]; // Force Svelte reactivity
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
        notice = null;
        await fetchRecipientInfo(address, index);
    }

    function handleRecipientAmountChange(index: number, amount: string) {
        recipients[index].amount = amount;
        // Force Svelte reactivity
        recipients = [...recipients];
    }

    function handleRecipientNoteChange(index: number, newNote: string) {
        recipients[index].note = newNote;
        // Force Svelte reactivity
        recipients = [...recipients];
    }

    function handleRecipientError(errorMessage: string | null) {
        error = errorMessage;
    }

    async function buildVSATransaction(recipientAddress: string, amount: number, suggestedParams: algosdk.SuggestedParams, noteText?: string): Promise<algosdk.Transaction> {
        if (!$selectedWallet?.address) {
            throw new Error('Wallet not connected');
        }
        return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: $selectedWallet.address,
            to: recipientAddress,
            amount: Math.floor(amount),
            note: noteText ? new TextEncoder().encode(noteText) : undefined,
            suggestedParams
        });
    }

    async function buildARC200Transaction(recipientAddress: string, amount: number, index: number, noteText?: string): Promise<algosdk.Transaction[]> {
        if (!$selectedWallet?.address) {
            throw new Error('Wallet not connected');
        }

        const contract = new Contract(Number(selectedToken.id), algodClient, algodIndexer, {
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

            // if the transaction is a payment, append the index of this transaction to the tx.txn field
            if (tx.type === 'pay') {
                const existingNote = tx.note ? new TextDecoder().decode(tx.note) : '';
                tx.note = new TextEncoder().encode(`${existingNote}${existingNote ? ' ' : ''}${index}`);
            }
            else {
                if (noteText) {
                    tx.note = new TextEncoder().encode(noteText);
                }
            }

            decodedTxns.push(tx);
        }

        return decodedTxns;
    }

    // Helper function to process items with rate limiting
    async function processWithRateLimit<T, R>(
        items: T[],
        processor: (item: T, index: number) => Promise<R>,
        rateLimit: number,
        onProgress?: (completed: number, total: number) => void
    ): Promise<R[]> {
        const results: R[] = [];
        const chunks: T[][] = [];
        
        // Split items into chunks based on rate limit
        for (let i = 0; i < items.length; i += rateLimit) {
            chunks.push(items.slice(i, i + rateLimit));
        }

        let completed = 0;
        const total = items.length;

        // Process each chunk with rate limiting
        for (const chunk of chunks) {
            // Process items in chunk concurrently
            const chunkResults = await Promise.all(
                chunk.map(async (item) => {
                    try {
                        const globalIndex = items.indexOf(item);
                        const result = await processor(item, globalIndex);
                        completed++;
                        onProgress?.(completed, total);
                        return result;
                    } catch (error) {
                        console.error('Error processing item:', error);
                        throw error;
                    }
                })
            );
            
            results.push(...chunkResults);
            
            // Wait 1 second before processing next chunk (5 per second = 200ms per item)
            if (chunks.indexOf(chunk) < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return results;
    }

    async function buildVOITransaction(recipientAddress: string, amount: number, suggestedParams: algosdk.SuggestedParams, noteText?: string): Promise<algosdk.Transaction> {
        if (!$selectedWallet?.address) {
            throw new Error('Wallet not connected');
        }
        return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: $selectedWallet.address,
            to: recipientAddress,
            amount: Math.floor(amount),
            note: noteText ? new TextEncoder().encode(noteText) : undefined,
            suggestedParams
        });
    }

    // Helper function to create optimized transaction groups
    function createOptimizedGroups(allTransactions: algosdk.Transaction[][]): algosdk.Transaction[][] {
        // First, separate all transactions into payments and non-payments, maintaining the relationship
        const txPairs: { payment: algosdk.Transaction | null; nonPayment: algosdk.Transaction | null }[] = [];
        
        allTransactions.forEach(txSet => {
            const payment = txSet.find(tx => tx.type === 'pay') || null;
            const nonPayment = txSet.find(tx => tx.type !== 'pay') || null;
            // Add pair regardless of transaction types
            txPairs.push({ payment, nonPayment });
        });

        // Initialize result array for groups
        const groups: algosdk.Transaction[][] = [];
        
        // Process transactions in groups, leaving room for the combined payment transaction
        const maxTransactionsPerBatch = MAX_TXN_PER_GROUP - 1;
        for (let i = 0; i < txPairs.length; i += maxTransactionsPerBatch) {
            // Get the current batch of pairs
            const currentBatch = txPairs.slice(i, i + maxTransactionsPerBatch);
            
            // Collect all valid transactions from the batch
            const batchTransactions: algosdk.Transaction[] = [];
            
            // First, handle payments if they exist
            const paymentsToProcess = currentBatch.filter(pair => pair.payment !== null);
            if (paymentsToProcess.length > 0) {
                const totalPaymentAmount = paymentsToProcess.reduce((sum, pair) => 
                    sum + (pair.payment ? Number(pair.payment.amount) : 0), 0);
                
                if (totalPaymentAmount > 0) {
                    const firstPayment = paymentsToProcess[0].payment!;
                    const combinedPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
                        from: algosdk.encodeAddress(firstPayment.from.publicKey),
                        to: algosdk.encodeAddress(firstPayment.to.publicKey),
                        amount: totalPaymentAmount,
                        note: firstPayment.note,
                        suggestedParams: {
                            fee: firstPayment.fee,
                            firstRound: firstPayment.firstRound,
                            lastRound: firstPayment.lastRound,
                            genesisHash: Buffer.from(firstPayment.genesisHash).toString('base64'),
                            genesisID: firstPayment.genesisID,
                            flatFee: true
                        }
                    });
                    batchTransactions.push(combinedPayment);
                }
            }
            
            // Then add all non-payment transactions
            const nonPaymentTransactions = currentBatch
                .filter(pair => pair.nonPayment)
                .map(pair => pair.nonPayment!);
            
            // Make sure we don't exceed MAX_TXN_PER_GROUP
            const remainingSlots = MAX_TXN_PER_GROUP - batchTransactions.length;
            batchTransactions.push(...nonPaymentTransactions.slice(0, remainingSlots));
            
            // If we have any transactions in this batch, create a group
            if (batchTransactions.length > 0) {
                if (batchTransactions.length > MAX_TXN_PER_GROUP) {
                    throw new Error(`${batchTransactions.length} transactions grouped together but max group size is ${MAX_TXN_PER_GROUP}`);
                }
                groups.push(algosdk.assignGroupID(batchTransactions));
            }
        }

        return groups;
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
            notice = null;
            transactionGroups = [];
            transactionIds = [];
            currentTxnGroup = 0;

            if (isARC200Token(selectedToken)) {
                // Prepare transaction requests
                const txRequests = recipients
                    .filter(r => r.address && r.amount)
                    .map(recipient => ({
                        address: recipient.address!,
                        amount: Math.floor(Number(enforceDecimals(recipient.amount, selectedToken.decimals)) * Math.pow(10, selectedToken.decimals)),
                        note: recipient.note
                    }));

                // Build transactions in parallel with rate limiting
                const txResults = await processWithRateLimit(
                    txRequests,
                    async (req, index) => {
                        return buildARC200Transaction(req.address, req.amount, index, req.note);
                    },
                    5, // Process 5 at a time
                    (completed, total) => {
                        // Update UI with progress
                        const percent = Math.round((completed / total) * 100);
                        notice = `Building transactions... ${completed}/${total} (${percent}%)`;
                    }
                );

                // Create optimized groups from all transactions
                const allGroups = createOptimizedGroups(txResults);
                transactionGroups = allGroups;
            } else {
                // Handle non-ARC200 tokens (native VOI and VSA)
                const suggestedParams = await algodClient.getTransactionParams().do();
                let currentGroup: algosdk.Transaction[] = [];

                for (const recipient of recipients) {
                    if (!recipient.address || !recipient.amount) continue;
                    
                    // Convert amount to raw units with proper decimal precision
                    const rawAmount = Math.floor(Number(enforceDecimals(recipient.amount, selectedToken.decimals)) * Math.pow(10, selectedToken.decimals));
                    
                    let txn;
                    if (isNativeToken(selectedToken)) {
                        txn = await buildVOITransaction(recipient.address, rawAmount, suggestedParams, recipient.note);
                    } else {
                        txn = await buildVSATransaction(recipient.address, rawAmount, suggestedParams, recipient.note);
                    }
                    delete txn.group;

                    if (currentGroup.length >= MAX_TXN_PER_GROUP) {
                        transactionGroups.push(algosdk.assignGroupID(currentGroup));
                        currentGroup = [];
                    }
                    currentGroup.push(txn);
                }

                // Add any remaining transactions as the final group
                if (currentGroup.length > 0) {
                    transactionGroups.push(algosdk.assignGroupID(currentGroup));
                }
            }

            // Split groups into batches of 16 groups each for signing
            const signingBatches: algosdk.Transaction[][] = [];
            for (let i = 0; i < transactionGroups.length; i += MAX_GROUPS_PER_SIGNING) {
                const batchGroups = transactionGroups.slice(i, i + MAX_GROUPS_PER_SIGNING);
                const batchTransactions = batchGroups.flat();
                signingBatches.push(batchTransactions);
            }

            totalTxnGroups = signingBatches.length;
            let currentBatch = 0;
            const allSignedTransactions: Uint8Array[][] = [];

            // Process each batch of groups
            txState = 'awaiting';
            for (const batchTransactions of signingBatches) {
                currentTxnGroup = currentBatch;
                
                // Sign all transactions in this batch (up to 16 groups) at once
                const signedTransactions = await signTransactions([batchTransactions]);
                if (!signedTransactions) {
                    throw new Error('User rejected transaction signing');
                }
                allSignedTransactions.push(signedTransactions);
                currentBatch++;
            }

            // Then send all transactions
            txState = 'sending';
            const sendPromises = allSignedTransactions.flatMap((signedBatch, batchIndex) => {
                // Split the signed transactions back into their original groups
                const groups: Uint8Array[][] = [];
                let txIndex = 0;
                const batchGroups = transactionGroups.slice(batchIndex * MAX_GROUPS_PER_SIGNING, (batchIndex + 1) * MAX_GROUPS_PER_SIGNING);
                
                for (const group of batchGroups) {
                    const groupSize = group.length;
                    groups.push(signedBatch.slice(txIndex, txIndex + groupSize));
                    txIndex += groupSize;
                }

                // Create send promises for each group
                return groups.map(async (signedGroup, groupIndex) => {
                    const overallGroupIndex = batchIndex * MAX_GROUPS_PER_SIGNING + groupIndex;
                    try {
                        const response = await algodClient.sendRawTransaction(signedGroup).do();
                        const confirmedTxn = await algosdk.waitForConfirmation(algodClient, response.txId, 4);
                        
                        // Get all transaction IDs from the signing group
                        const txIds = signedGroup.map(stxn => {
                            const decoded = algosdk.decodeSignedTransaction(stxn);
                            return decoded.txn.txID();
                        });

                        return {
                            success: true,
                            txIds,
                            confirmedTxn,
                            batchIndex,
                            groupIndex: overallGroupIndex
                        };
                    } catch (err) {
                        return {
                            success: false,
                            txIds: [],
                            error: err instanceof Error ? err.message : 'Unknown error occurred',
                            batchIndex,
                            groupIndex: overallGroupIndex
                        };
                    }
                });
            });

            const results = await Promise.all(sendPromises);
            
            // Process results and collect successful/failed transactions
            const successfulTxns = results.filter(r => r.success).flatMap(r => r.txIds);
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
    }

    function resetState() {
        recipients = [{ address: null, amount: '', note: '', info: null, isLoading: false, isValid: false }];
        error = null;
        notice = null;
        success = false;
        isSending = false;
        transactionId = null;
        noteForAll = '';
        currentTxnGroup = 0;
        totalTxnGroups = 0;
        transactionGroups = [];
        transactionIds = [];
        hasCompletedTransaction = false;
        failedRecipients = [];
        showRetryButton = false;
    }

    function clearAllRecipients() {
        recipients = [{ address: null, amount: '', note: '', info: null, isLoading: false, isValid: false }];
        error = null;
        notice = null;
    }

    function hasDuplicateRecipients(): boolean {
        const addresses = recipients
            .filter(r => r.address)
            .map(r => r.address);
        return addresses.length !== new Set(addresses).size;
    }

    function combineRecipients(method: 'sum' | 'max' | 'min') {
        const combined = recipients.reduce((acc, curr) => {
            if (!curr.address) return acc;
            
            const existing = acc.find(r => r.address === curr.address);
            if (existing) {
                const currentAmount = Number(curr.amount) || 0;
                const existingAmount = Number(existing.amount) || 0;
                
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
                
                existing.amount = newAmount > 0 ? enforceDecimals(newAmount, selectedToken.decimals) : '';
                return acc;
            }
            
            return [...acc, { ...curr }];
        }, [] as Recipient[]);

        // If we found and combined any duplicates, update the recipients
        if (combined.length < recipients.length) {
            recipients = combined;
            error = null;
            notice = null;
        }
        showCombineOptions = false;
    }

    function setAmountForAllRecipients(amount: string) {
        recipients = recipients.map(recipient => ({
            ...recipient,
            amount: enforceDecimals(amount, selectedToken.decimals)
        }));
    }

    function distributeAmount(type: 'even' | 'max') {
        if (!isValidAmount) return;
        if (type === 'even' && !canSplitEvenly) return;
        if (type === 'max' && !canMaxEach) return;
        
        const amount = Number(amountToDistribute);
        if (type === 'even') {
            const splitAmount = enforceDecimals(amount / recipients.length, selectedToken.decimals);
            setAmountForAllRecipients(splitAmount);
        } else {
            setAmountForAllRecipients(enforceDecimals(amountToDistribute, selectedToken.decimals));
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

        // Force Svelte reactivity
        recipients = [...recipients];

        error = null;
        notice = null;
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
        resetState();
        // Populate the recipients list with failed transactions
        recipients = failedRecipients;
        // Reset failed recipients list
        failedRecipients = [];
        showRetryButton = false;
        success = false;
    }

    function handleTokenChange(newToken: FungibleTokenType) {
        // If selecting VOI, ensure we use the latest balance
        if (isNativeToken(newToken)) {
            selectedToken = {
                type: 'native',
                symbol: 'VOI',
                decimals: 6,
                balance: nativeVoiToken.balance,
                name: 'Voi'
            };
        } else {
            selectedToken = newToken;
        }
        error = null;
        notice = null;
    }

    function setNoteForAllRecipients(noteText: string) {
        recipients = recipients.map(recipient => ({
            ...recipient,
            note: noteText
        }));
        noteForAll = '';
        showNoteMenu = false;
    }
</script>

<Modal bind:open size="lg" on:close={handleClose} class="overflow-visible max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)]">
    <div class="w-full sm:max-w-3xl mx-auto flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-6rem)]">
        <div class="flex-none">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div class="flex items-center gap-4">
                    <h3 class="text-xl font-bold text-gray-900 dark:text-white">Send</h3>
                    <div class="relative flex-1 sm:flex-none" use:clickOutside={() => showTokenSelect = false}>
                        <button
                            type="button"
                            class="w-64 px-3 py-2 text-left bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm flex items-center gap-2"
                            on:click={() => showTokenSelect = !showTokenSelect}
                        >
                            {#if (selectedToken.id && tokenImages.has(selectedToken.id)) || isNativeToken(selectedToken)}
                                <img 
                                    src={isNativeToken(selectedToken) ? "https://asset-verification.nautilus.sh/icons/0.png" : tokenImages.get(selectedToken.id ?? '')!}
                                    alt=""
                                    class="w-4 h-4 rounded-full bg-transparent"
                                />
                            {/if}
                            <span>{selectedToken.symbol} ({(selectedToken.balance / Math.pow(10, selectedToken.decimals)).toLocaleString()})</span>
                            <i class="fas fa-chevron-down ml-auto"></i>
                        </button>
                        {#if showTokenSelect}
                            <div class="absolute left-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-60 overflow-y-auto">
                                {#each availableTokens as token (token.id ?? '0')}
                                    <button
                                        class="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                        on:click={() => {
                                            handleTokenChange(token);
                                            showTokenSelect = false;
                                        }}
                                    >
                                        {#if (token.id && tokenImages.has(token.id)) || isNativeToken(token)}
                                            <img 
                                                src={isNativeToken(token) ? "https://asset-verification.nautilus.sh/icons/0.png" : tokenImages.get(token.id)!}
                                                alt=""
                                                class="w-4 h-4 rounded-full bg-transparent"
                                            />
                                        {/if}
                                        {token.symbol} ({(token.balance / Math.pow(10, token.decimals)).toLocaleString()})
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 justify-between sm:justify-end w-full sm:w-auto">
                    {#if (selectedToken.id && tokenImages.has(selectedToken.id)) || isNativeToken(selectedToken)}
                        <img 
                            src={isNativeToken(selectedToken) ? "https://asset-verification.nautilus.sh/icons/0.png" : tokenImages.get(selectedToken.id ?? '')!}
                            alt=""
                            class="h-8 sm:h-12 rounded-full bg-transparent"
                        />
                    {/if}
                    <span>Available: {maxAmount.toLocaleString()} {selectedToken.symbol}</span>
                </div>
            </div>
        </div>
        
        {#if !success}
            <div class="flex flex-col flex-1 min-h-0">
                <div class="flex-none">
                    <div class="flex flex-wrap gap-2 items-center justify-between mb-6">
                        <h3 class="text-lg font-medium">Recipients</h3>
                        <div class="flex flex-wrap gap-2">
                            <div class="relative" use:clickOutside={() => showCombineOptions = false}>
                                <Button 
                                    size="xs" 
                                    color={hasDuplicateRecipients() ? "blue" : "light"}
                                    on:click={() => showCombineOptions = !showCombineOptions}
                                    disabled={recipients.length <= 1 || !hasDuplicateRecipients()}
                                    class={hasDuplicateRecipients() ? "animate-pulse" : ""}
                                >
                                    <i class="fas fa-compress-alt mr-1"></i>
                                    Combine
                                </Button>
                                {#if showCombineOptions}
                                    <div class="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
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
                                                Use Highest
                                            </button>
                                            <button
                                                class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                on:click={() => combineRecipients('min')}
                                            >
                                                <i class="fas fa-arrow-down mr-2"></i>
                                                Use Lowest
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
                                Clear
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
                                    Set All
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
                                                    step={`${1/Math.pow(10, selectedToken.decimals)}`}
                                                    placeholder={`Amount in ${selectedToken.symbol}`}
                                                    size="sm"
                                                    on:input={(e: Event) => {
                                                        const input = e.target as HTMLInputElement;
                                                        amountToDistribute = enforceDecimals(input.value, selectedToken.decimals);
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
                                                                Need {totalRequiredForMax} {selectedToken.symbol}
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
                            <div class="relative">
                                <Button 
                                    size="xs" 
                                    color="light"
                                    on:click={() => showNoteMenu = !showNoteMenu}
                                    data-set-notes-button
                                >
                                    <i class="fas fa-sticky-note mr-1"></i>
                                    Set Notes
                                </Button>
                                {#if showNoteMenu}
                                    <div class="absolute right-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[100]" data-set-notes-menu>
                                        <div class="p-3 space-y-3">
                                            <div>
                                                <Label class="mb-2 text-sm">Note for all recipients:</Label>
                                                <Input
                                                    type="text"
                                                    bind:value={noteForAll}
                                                    maxlength={1000}
                                                    placeholder="Enter a note for all recipients"
                                                    size="sm"
                                                />
                                                <div class="text-xs text-right mt-1 text-gray-500 dark:text-gray-400">
                                                    {noteForAll.length}/1000
                                                </div>
                                            </div>
                                            <Button 
                                                size="xs"
                                                color="blue"
                                                class="w-full"
                                                on:click={() => setNoteForAllRecipients(noteForAll)}
                                                disabled={!noteForAll}
                                            >
                                                <i class="fas fa-check mr-1"></i>
                                                Apply to All Recipients
                                            </Button>
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

                <div class="flex-1 min-h-0 overflow-y-auto">
                    <div class="space-y-6">
                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                            <!-- Header -->
                            <div class="grid grid-cols-[minmax(200px,1fr),minmax(80px,120px)] sm:grid-cols-[minmax(280px,420px),120px] gap-4 p-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-500 dark:text-gray-400">
                                <div>Recipient</div>
                                <div>Amount</div>
                            </div>

                            <!-- Recipients -->
                            <div class="divide-y divide-gray-200 dark:divide-gray-700 relative">
                                {#each recipients as recipient, index}
                                    <RecipientRow 
                                        bind:recipient={recipients[index]}
                                        {index}
                                        isLastRecipient={recipients.length === 1}
                                        {selectedToken}
                                        {maxAmount}
                                        onRemove={removeRecipient}
                                        onAmountChange={handleRecipientAmountChange}
                                        onNoteChange={handleRecipientNoteChange}
                                        onError={handleRecipientError}
                                    />
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
                    </div>
                </div>

                <div class="flex-none pt-4 mt-auto">
                    {#if error}
                        <div class="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">
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
                    {#if notice}
                        <div class="mb-4 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-lg text-sm">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <i class="fas fa-clock"></i>
                                    <span>{notice}</span>
                                </div>
                                <button
                                    type="button"
                                    class="text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                                    on:click={() => notice = null}
                                    title="Dismiss notice"
                                    aria-label="Dismiss notice"
                                >
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    {/if}
                    <div class="flex flex-col sm:flex-row gap-3 items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div class="flex flex-col sm:flex-row items-center gap-4 text-sm w-full sm:w-auto">
                            <div class="text-center sm:text-left">
                                <span class="text-gray-500 dark:text-gray-400">Total Amount:</span>
                                <span class="ml-1 font-medium text-gray-900 dark:text-white">{totalAmount} {selectedToken.symbol}</span>
                            </div>
                            <div class="text-center sm:text-left">
                                <span class="text-gray-500 dark:text-gray-400">Recipients:</span>
                                <span class="ml-1 font-medium text-gray-900 dark:text-white">{recipients.filter(r => r.address && r.amount).length}</span>
                            </div>
                        </div>
                        <div class="flex gap-3 w-full sm:w-auto">
                            <Button color="alternative" class="flex-1 sm:flex-none" on:click={handleClose}>Cancel</Button>
                            <Button 
                                color="blue"
                                class="flex-1 sm:flex-none"
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
                                    Awaiting Signature {#if totalTxnGroups > 1}(Batch {currentTxnGroup + 1} of {totalTxnGroups}){/if}
                                {:else if txState === 'sending'}
                                    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Sending {#if totalTxnGroups > 1}(Batch {currentTxnGroup + 1} of {totalTxnGroups}){/if}
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
                            Successfully sent {totalAmount} {selectedToken.symbol}
                        </p>                        
                        <div class="text-sm">
                            <p class="text-gray-600 dark:text-gray-400 mb-2">Transaction ID{transactionIds.length > 1 ? 's' : ''}:</p>
                            <div class="flex flex-col items-center max-h-48 overflow-y-auto space-y-2 p-2">
                                {#each transactionIds as txId}
                                    <div class="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/50 rounded-md font-mono w-full">
                                        <a 
                                            href={`https://explorer.voi.network/explorer/transaction/${txId}`} 
                                            target="_blank" 
                                            class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 truncate"
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
                </div>
            </div>
        {/if}
    </div>
</Modal>
{#if showImportModal}
    <ImportRecipientsModal 
        bind:open={showImportModal} 
        onClose={() => showImportModal = false} 
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
        width: 100%;
        max-width: min(100vw - 1rem, 48rem);
        margin: 0.5rem;
    }
    :global(.modal > div) {
        width: 100%;
        max-width: min(100vw - 1rem, 48rem);
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

    @media (max-width: 640px) {
        :global(.modal) {
            padding: 0.25rem;
            margin: 0.25rem;
        }
        :global(.modal > div) {
            padding: 0.75rem;
        }
        :global(.modal input[type="number"]) {
            min-width: 0;
            width: 100%;
        }
        :global(.modal button) {
            white-space: nowrap;
        }
        :global(.flex-1.min-h-0.overflow-y-auto) {
            margin-bottom: 1rem;
        }
    }
</style> 

<svelte:window on:click={(e) => {
    const setNotesButton = document.querySelector('[data-set-notes-button]');
    const setNotesMenu = document.querySelector('[data-set-notes-menu]');
    
    if (setNotesButton && setNotesMenu && 
        !setNotesButton.contains(e.target as Node) && 
        !setNotesMenu.contains(e.target as Node) &&
        showNoteMenu) {
        showNoteMenu = false;
    }
}} /> 

