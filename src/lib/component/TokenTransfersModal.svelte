<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import type { FungibleTokenType } from '$lib/types/assets';
    import { formatAddress } from '$lib/utils';
    import { getEnvoiNames } from '$lib/utils/envoi';
    import algosdk from 'algosdk';
    import { algodIndexer } from '$lib/utils/algod';

    export let open = false;
    export let token: FungibleTokenType;
    export let walletId: string;

    interface Transfer {
        contractid?: string;
        from: string;
        to: string;
        amount: string;
        round: number;
        transactionid: string;
        timestamp: number;
        from_name?: string;
        to_name?: string;
        note?: string;
        type?: 'payment' | 'fee' | 'inner-payment';
        parentTxId?: string;
        fee?: number;
    }

    let transfers: Transfer[] = [];
    let filteredTransfers: Transfer[] = [];
    let isLoading = false;
    let error: string | null = null;
    let offset = 0;
    let limit = 50;
    let hasMore = true;
    let expandedRows = new Set<string>();
    let nextToken: string | undefined = undefined;

    // Filter states
    let fromAddress = '';
    let toAddress = '';
    let note = '';
    let showMobileFilters = false;
    let showFeeTransactions = false;

    function toggleRow(transactionId: string) {
        if (expandedRows.has(transactionId)) {
            expandedRows.delete(transactionId);
        } else {
            expandedRows.add(transactionId);
        }
        expandedRows = expandedRows; // Trigger reactivity
    }

    onMount(() => {
        if (document) {
            document.body.style.overflow = 'hidden';
        }
    });

    onDestroy(() => {
        if (document) {
            document.body.style.overflow = 'unset';
        }
    });

    async function fetchTransfers(append = false) {
        if (isLoading) return;
        isLoading = true;
        error = null;
        try {
            let newTransfers: Transfer[] = [];
            
            if (token.type === 'native') {
                // Fetch all transactions involving this address
                const txns = await algodIndexer
                    .searchForTransactions()
                    .address(walletId)
                    .limit(limit)
                    .nextToken(append && nextToken ? nextToken : '')
                    .do();

                // Store the next token for pagination
                nextToken = txns['next-token'];
                hasMore = !!nextToken;

                // Process each transaction
                txns.transactions.forEach((tx: any) => {
                    const transfers: Transfer[] = [];

                    // Handle different transaction types that affect VOI balance
                    if (tx['tx-type'] === 'pay') {
                        // Regular payment transaction
                        transfers.push({
                            from: tx.sender,
                            to: tx['payment-transaction'].receiver,
                            amount: (tx['payment-transaction'].amount / Math.pow(10, token.decimals)).toString(),
                            round: tx['confirmed-round'],
                            transactionid: tx.id,
                            timestamp: tx['round-time'],
                            note: tx.note ? Buffer.from(tx.note, 'base64').toString() : undefined,
                            type: 'payment',
                            fee: tx.fee
                        });
                    } else if (tx.sender === walletId && tx.fee > 0 && tx['tx-type'] !== 'pay') {
                        // Only add standalone fee transfer if this is not a payment transaction
                        transfers.push({
                            from: tx.sender,
                            to: 'TBEIGCNK4UCN3YDP2NODK3MJHTUZMYS3TABRM2MVSI2MPUR2V36E5JYHSY',
                            amount: (tx.fee / Math.pow(10, token.decimals)).toString(),
                            round: tx['confirmed-round'],
                            transactionid: tx.id,
                            timestamp: tx['round-time'],
                            note: tx.note ? Buffer.from(tx.note, 'base64').toString() : undefined,
                            type: 'fee'
                        });
                    }

                    // Handle inner transactions for all transaction types
                    if (tx['inner-txns']) {
                        tx['inner-txns'].forEach((innerTx: any) => {
                            if (innerTx['tx-type'] === 'pay') {
                                transfers.push({
                                    from: innerTx.sender,
                                    to: innerTx['payment-transaction'].receiver,
                                    amount: (innerTx['payment-transaction'].amount / Math.pow(10, token.decimals)).toString(),
                                    round: tx['confirmed-round'],
                                    transactionid: innerTx.id,
                                    timestamp: tx['round-time'],
                                    note: innerTx.note ? Buffer.from(innerTx.note, 'base64').toString() : undefined,
                                    type: 'inner-payment',
                                    parentTxId: tx.id,
                                    fee: 0
                                });
                            }
                        });
                    }

                    // Only add transfers that involve our wallet address
                    newTransfers.push(...transfers.filter(t => 
                        t.from === walletId || t.to === walletId
                    ));
                });

                // Sort by timestamp descending (most recent first)
                newTransfers.sort((a, b) => b.timestamp - a.timestamp);
            } else if (token.type === 'arc200') {
                // Fetch ARC200 transfers
                const response = await fetch(`/api/mimir?action=get_arc200_transfers&p_contractid=${token.id}&p_user=${walletId}&p_limit=${limit}&p_offset=${offset}`);
                const result = await response.json();
                
                if (result.error) {
                    throw new Error(result.error);
                }
                
                newTransfers = result.data.map((transfer: Transfer) => ({
                    ...transfer,
                    amount: (Number(transfer.amount) / Math.pow(10, token.decimals)).toString()
                }));
                
                // For ARC200, use length-based pagination
                hasMore = newTransfers.length === limit;
            } else {
                // Fetch VSA transfers
                const assetId = Number(token.id);
                const txns = await algodIndexer
                    .searchForTransactions()
                    .assetID(assetId)
                    .address(walletId)
                    .limit(limit)
                    .nextToken(append && nextToken ? nextToken : '')
                    .do();

                // Store the next token for pagination
                nextToken = txns['next-token'];
                hasMore = !!nextToken;

                newTransfers = txns.transactions
                    .filter((tx: any) => tx['tx-type'] === 'axfer')
                    .map((tx: any) => ({
                        from: tx.sender,
                        to: tx['asset-transfer-transaction'].receiver,
                        amount: (tx['asset-transfer-transaction'].amount / Math.pow(10, token.decimals)).toString(),
                        round: tx['confirmed-round'],
                        transactionid: tx.id,
                        timestamp: tx['round-time'],
                        note: tx.note ? Buffer.from(tx.note, 'base64').toString() : undefined
                    }));
            }

            // Don't append empty results
            if (newTransfers.length === 0) {
                hasMore = false;
                isLoading = false;
                return;
            }

            // collect unique addresses
            const uniqueAddresses = [...new Set([...transfers.map((t: Transfer) => t.from), ...newTransfers.map((t: Transfer) => t.from), ...newTransfers.map((t: Transfer) => t.to)])];
            const envoiNames = await getEnvoiNames(uniqueAddresses);
            newTransfers.forEach((t: Transfer) => {
                if (t.to === 'TBEIGCNK4UCN3YDP2NODK3MJHTUZMYS3TABRM2MVSI2MPUR2V36E5JYHSY') {
                    t.to_name = 'Fee Sink';
                } else {
                    t.to_name = envoiNames.find(n => n.address === t.to)?.name || undefined;
                }
                t.from_name = envoiNames.find(n => n.address === t.from)?.name || undefined;
            });

            if (append) {
                transfers = [...transfers, ...newTransfers];
            } else {
                transfers = newTransfers;
            }
            applyFilters();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to fetch transfers';
            hasMore = false;
        } finally {
            isLoading = false;
        }
    }

    function applyFilters() {
        filteredTransfers = transfers.filter(transfer => {
            // First apply fee transaction filter
            if (!showFeeTransactions && transfer.type === 'fee') {
                return false;
            }

            const matchesFromAddress = !fromAddress || 
                transfer.from.toLowerCase().includes(fromAddress.toLowerCase()) ||
                transfer.from_name?.toLowerCase().includes(fromAddress.toLowerCase());
            const matchesToAddress = !toAddress || 
                transfer.to.toLowerCase().includes(toAddress.toLowerCase()) ||
                transfer.to_name?.toLowerCase().includes(toAddress.toLowerCase());
            const matchesNote = !note || 
                (transfer.note?.toLowerCase().includes(note.toLowerCase()) ?? false);
            return matchesFromAddress && matchesToAddress && matchesNote;
        });
    }

    function handleScroll(e: Event) {
        const target = e.target as HTMLDivElement;
        const bottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
        
        if (bottom && !isLoading && hasMore) {
            if (token.type === 'arc200') {
                offset += limit;
            }
            fetchTransfers(true);
        }
    }

    function formatTimestamp(timestamp: number): string {
        return new Date(timestamp * 1000).toLocaleString();
    }

    function calculateRunningBalance(transfer: Transfer, index: number): string {
        // Start with current balance in decimal form
        let runningBalance = Number(token.balance) / Math.pow(10, token.decimals);
        
        // Go through all newer transactions (from 0 to current index-1)
        // and reverse their effects to get the historical balance
        for (let i = 0; i < index; i++) {
            const t = filteredTransfers[i];
            const amount = Number(t.amount);
            
            // When going backwards in time:
            // 1. If we received money after this point, we need to subtract it to get the historical balance
            // 2. If we sent money after this point, we need to add it back to get the historical balance
            // 3. If we paid fees after this point, we need to add them back to get the historical balance
            if (t.type === 'fee') {
                runningBalance += amount; // Add back fees that were paid after this point
            } else if (t.to === walletId) {
                runningBalance -= amount; // Subtract money we received after this point
            } else if (t.from === walletId) {
                runningBalance += amount; // Add back money we sent after this point
            }
        }
        
        return runningBalance.toFixed(token.decimals);
    }

    function formatChange(transfer: Transfer): string {
        // Amount is already in decimal form
        const amount = Number(transfer.amount);
        if (transfer.type === 'fee') {
            return `-${amount.toFixed(token.decimals)}`; // Fees are always negative
        }
        if (transfer.to === walletId) {
            return `+${amount.toFixed(token.decimals)}`;
        }
        if (transfer.from === walletId) {
            return `-${amount.toFixed(token.decimals)}`;
        }
        return amount.toFixed(token.decimals);
    }

    $: if (open) {
        offset = 0;
        nextToken = undefined;
        transfers = [];
        filteredTransfers = [];
        fetchTransfers();
    }

    $: {
        fromAddress;
        toAddress;
        note;
        showFeeTransactions;
        applyFilters();
    }
</script>

{#if open}
<div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
    <div class="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
            <div>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                    {token.symbol} Transfers
                </h2>
                <div class="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    Current Balance: <span class="font-medium">{token.balance / Math.pow(10, token.decimals)} {token.symbol}</span>
                </div>
            </div>
            <button 
                class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                on:click={() => open = false}
                aria-label="Close"
            >
                <i class="fas fa-times"></i>
            </button>
        </div>

        <!-- Filters Section -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <!-- Desktop Filters -->
            <div class="hidden md:grid grid-cols-{token.type === 'native' ? '4' : '3'} gap-4">
                <div class="space-y-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300">From Address</label>
                    <input
                        type="text"
                        bind:value={fromAddress}
                        placeholder="Search from address"
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    />
                </div>
                <div class="space-y-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300">To Address</label>
                    <input
                        type="text"
                        bind:value={toAddress}
                        placeholder="Search to address"
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    />
                </div>
                <div class="space-y-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Note</label>
                    <input
                        type="text"
                        bind:value={note}
                        placeholder="Search note"
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    />
                </div>
                {#if token.type === 'native'}
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Show Fee Transactions</label>
                        <div class="flex items-center">
                            <button
                                class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-full text-left flex justify-between items-center {showFeeTransactions ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' : 'bg-gray-50 dark:bg-gray-700/50'}"
                                on:click={() => showFeeTransactions = !showFeeTransactions}
                            >
                                <span class="text-sm text-gray-700 dark:text-gray-300">{showFeeTransactions ? 'Showing' : 'Hidden'}</span>
                                <i class="fas fa-toggle-{showFeeTransactions ? 'on text-blue-500' : 'off text-gray-400'}"></i>
                            </button>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Mobile Filters -->
            <div class="md:hidden">
                <button
                    class="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
                    on:click={() => showMobileFilters = !showMobileFilters}
                >
                    <span>Filters</span>
                    <i class="fas fa-{showMobileFilters ? 'chevron-up' : 'chevron-down'}"></i>
                </button>
                
                {#if showMobileFilters}
                    <div class="mt-2 space-y-2 animate-slideDown">
                        <div class="relative">
                            <input
                                type="text"
                                bind:value={fromAddress}
                                placeholder="From address"
                                class="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                            />
                            <i class="fas fa-user absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        </div>
                        <div class="relative">
                            <input
                                type="text"
                                bind:value={toAddress}
                                placeholder="To address"
                                class="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                            />
                            <i class="fas fa-user absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        </div>
                        <div class="relative">
                            <input
                                type="text"
                                bind:value={note}
                                placeholder="Search note"
                                class="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                            />
                            <i class="fas fa-note-sticky absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        </div>
                        {#if token.type === 'native'}
                            <button
                                class="w-full px-4 py-2 text-left text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md flex justify-between items-center {showFeeTransactions ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' : 'bg-gray-50 dark:bg-gray-700/50'}"
                                on:click={() => showFeeTransactions = !showFeeTransactions}
                            >
                                <span class="text-gray-700 dark:text-gray-300">Show Fee Transactions</span>
                                <i class="fas fa-toggle-{showFeeTransactions ? 'on text-blue-500' : 'off text-gray-400'}"></i>
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>

        <div 
            class="flex-1 overflow-auto p-4" 
            on:scroll={handleScroll}
            style="max-height: calc(90vh - 12rem); min-height: 300px;"
        >
            {#if error}
                <div class="text-red-500 text-center py-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    {error}
                </div>
            {:else if filteredTransfers.length === 0 && !isLoading}
                <div class="text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    No transfers found
                </div>
            {:else}
                <div class="space-y-3">
                    {#each filteredTransfers as transfer, index (`${transfer.transactionid}-${transfer.round}-${index}`)}
                        <div class="bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 {transfer.type === 'inner-payment' ? 'ml-4 border-l-4 border-l-purple-200 dark:border-l-purple-800' : ''}">
                            <div class="p-3 md:p-4">
                                <!-- Mobile Layout -->
                                <div class="md:hidden">
                                    <div class="flex justify-between items-start mb-2">
                                        <div>
                                            <div class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                                {transfer.amount} {token.symbol}
                                                {#if transfer.type === 'fee'}
                                                    <span class="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded-full">
                                                        Fee
                                                    </span>
                                                {:else if transfer.type === 'inner-payment'}
                                                    <span class="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 rounded-full">
                                                        Inner
                                                    </span>
                                                {/if}
                                            </div>
                                            <div class="text-xs text-gray-500 dark:text-gray-400">
                                                {formatTimestamp(transfer.timestamp)}
                                            </div>
                                        </div>
                                        <div class="text-right">
                                            <div class="text-sm">
                                                <span class={`font-medium ${transfer.to === walletId ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                    {formatChange(transfer)} {token.symbol}
                                                </span>
                                                {#if token.type === 'native' && transfer.type === 'payment' && transfer.fee && transfer.fee > 0 && transfer.from === walletId}
                                                    <div class="text-xs text-gray-500 dark:text-gray-400">
                                                        -{(transfer.fee / Math.pow(10, token.decimals)).toFixed(token.decimals)} {token.symbol} fee
                                                    </div>
                                                {/if}
                                            </div>
                                            <div class="text-xs text-gray-500 dark:text-gray-400">
                                                Balance: {calculateRunningBalance(transfer, index)} {token.symbol}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="space-y-2">
                                        <div>
                                            <div class="text-xs text-gray-500 dark:text-gray-400">From</div>
                                            <a 
                                                href={`https://explorer.voi.network/explorer/account/${transfer.from}`}
                                                class="text-blue-500 hover:text-blue-600 transition-colors text-sm block"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <div class="break-all">
                                                    {#if transfer.from_name}
                                                        <span class="font-medium">{transfer.from_name}</span>
                                                        <span class="text-gray-500 dark:text-gray-400 ml-1">({formatAddress(transfer.from)})</span>
                                                    {:else}
                                                        {formatAddress(transfer.from)}
                                                    {/if}
                                                </div>
                                            </a>
                                        </div>
                                        <div>
                                            <div class="text-xs text-gray-500 dark:text-gray-400">To</div>
                                            <a 
                                                href={`https://explorer.voi.network/explorer/account/${transfer.to}`}
                                                class="text-blue-500 hover:text-blue-600 transition-colors text-sm block"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <div class="break-all">
                                                    {#if transfer.to_name}
                                                        <span class="font-medium">{transfer.to_name}</span>
                                                        <span class="text-gray-500 dark:text-gray-400 ml-1">({formatAddress(transfer.to)})</span>
                                                    {:else}
                                                        {formatAddress(transfer.to)}
                                                    {/if}
                                                </div>
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <!-- Desktop Layout -->
                                <div class="hidden md:flex items-start gap-4 md:gap-6">
                                    <div class="flex-none w-44">
                                        <div class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                            {transfer.amount} {token.symbol}
                                            {#if transfer.type === 'fee'}
                                                <span class="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded-full">
                                                    Fee
                                                </span>
                                            {:else if transfer.type === 'inner-payment'}
                                                <span class="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 rounded-full">
                                                    Inner
                                                </span>
                                            {/if}
                                        </div>
                                        <div class="text-xs text-gray-500 dark:text-gray-400">
                                            {formatTimestamp(transfer.timestamp)}
                                        </div>
                                    </div>
                                    
                                    <div class="flex-1 min-w-0 grid grid-cols-2 gap-2 md:gap-6">
                                        <div class="min-w-0">
                                            <div class="text-xs text-gray-500 dark:text-gray-400">From</div>
                                            <a 
                                                href={`https://explorer.voi.network/explorer/account/${transfer.from}`}
                                                class="text-blue-500 hover:text-blue-600 transition-colors text-sm block"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <div class="truncate">
                                                    {#if transfer.from_name}
                                                        <span class="font-medium">{transfer.from_name}</span>
                                                        <span class="text-gray-500 dark:text-gray-400 ml-1">({formatAddress(transfer.from)})</span>
                                                    {:else}
                                                        {formatAddress(transfer.from)}
                                                    {/if}
                                                </div>
                                            </a>
                                        </div>
                                        <div class="min-w-0">
                                            <div class="text-xs text-gray-500 dark:text-gray-400">To</div>
                                            <a 
                                                href={`https://explorer.voi.network/explorer/account/${transfer.to}`}
                                                class="text-blue-500 hover:text-blue-600 transition-colors text-sm block"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <div class="truncate">
                                                    {#if transfer.to_name}
                                                        <span class="font-medium">{transfer.to_name}</span>
                                                        <span class="text-gray-500 dark:text-gray-400 ml-1">({formatAddress(transfer.to)})</span>
                                                    {:else}
                                                        {formatAddress(transfer.to)}
                                                    {/if}
                                                </div>
                                            </a>
                                        </div>
                                    </div>

                                    <div class="flex-none w-44 text-right">
                                        <div class="text-sm">
                                            <span class={`font-medium ${transfer.to === walletId ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {formatChange(transfer)} {token.symbol}
                                            </span>
                                                {#if token.type === 'native' && transfer.type === 'payment' && transfer.fee && transfer.fee > 0 && transfer.from === walletId}
                                                    <div class="text-xs text-gray-500 dark:text-gray-400">
                                                        -{(transfer.fee / Math.pow(10, token.decimals)).toFixed(token.decimals)} {token.symbol} fee
                                                    </div>
                                                {/if}
                                        </div>
                                        <div class="text-xs text-gray-500 dark:text-gray-400">
                                            Balance: {calculateRunningBalance(transfer, index)} {token.symbol}
                                        </div>
                                    </div>
                                </div>

                                <div class="flex justify-between place-items-start mt-2">
                                    {#if transfer.note}
                                        <div class="md:pl-[12.5rem] overflow-auto w-max-300">
                                            <div class="text-gray-500 dark:text-gray-400 font-medium text-xs">Tx Note</div>
                                            <div class="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap break-words">
                                                {transfer.note}
                                            </div>
                                        </div>
                                    {:else}
                                        <div class="md:pl-[12.5rem]"></div>
                                    {/if}
                                    <a 
                                        href={`https://explorer.voi.network/explorer/transaction/${transfer.type === 'inner-payment' ? transfer.parentTxId : transfer.transactionid}`}
                                        class="text-blue-500 hover:text-blue-600 transition-colors text-xs inline-flex items-center gap-1"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        View <i class="fas fa-magnifying-glass"></i>
                                    </a>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
            {#if isLoading}
                <div class="flex justify-center items-center py-4">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            {/if}
        </div>
    </div>
</div>
{/if} 

<style>
    .animate-slideDown {
        animation: slideDown 0.2s ease-out;
    }

    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style> 