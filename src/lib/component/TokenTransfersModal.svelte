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
    }

    let transfers: Transfer[] = [];
    let filteredTransfers: Transfer[] = [];
    let isLoading = false;
    let error: string | null = null;
    let offset = 0;
    let limit = 50;
    let hasMore = true;
    let expandedRows = new Set<string>();

    // Filter states
    let fromAddress = '';
    let toAddress = '';
    let note = '';
    let showMobileFilters = false;

    function toggleRow(transactionId: string) {
        if (expandedRows.has(transactionId)) {
            expandedRows.delete(transactionId);
        } else {
            expandedRows.add(transactionId);
        }
        expandedRows = expandedRows; // Trigger reactivity
    }

    onMount(() => {
        document.body.style.overflow = 'hidden';
    });

    onDestroy(() => {
        document.body.style.overflow = 'unset';
    });

    async function fetchTransfers(append = false) {
        if (isLoading) return;
        isLoading = true;
        error = null;
        try {
            let newTransfers: Transfer[] = [];
            
            if (token.type === 'arc200') {
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
            } else {
                // Fetch VSA transfers
                const assetId = Number(token.id);
                const txns = await algodIndexer
                    .searchForTransactions()
                    .assetID(assetId)
                    .address(walletId)
                    .limit(limit)
                    .nextToken(append && offset > 0 ? offset.toString() : '')
                    .do();

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

            // If we got fewer results than the limit, or no results, there's no more data
            hasMore = newTransfers.length === limit;

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
                t.from_name = envoiNames.find(n => n.address === t.from)?.name || undefined;
                t.to_name = envoiNames.find(n => n.address === t.to)?.name || undefined;
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
            offset += limit;
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
            
            if (t.to === walletId) {
                runningBalance -= amount; // Subtract incoming transfers (going backwards)
            }
            if (t.from === walletId) {
                runningBalance += amount; // Add outgoing transfers (going backwards)
            }
        }
        
        return runningBalance.toFixed(token.decimals);
    }

    function formatChange(transfer: Transfer): string {
        // Amount is already in decimal form
        const amount = Number(transfer.amount);
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
        fetchTransfers();
    }

    $: {
        fromAddress;
        toAddress;
        note;
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
            <div class="hidden md:grid grid-cols-3 gap-4">
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
                    </div>
                {/if}
            </div>
        </div>

        <div class="flex-1 overflow-auto p-4" on:scroll={handleScroll}>
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
                        <div class="bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600">
                            <div class="p-3 md:p-4">
                                <div class="flex items-start gap-4 md:gap-6">
                                    <div class="flex-none w-44">
                                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                                            {transfer.amount} {token.symbol}
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
                                        </div>
                                        <div class="text-xs text-gray-500 dark:text-gray-400">
                                            Balance: {calculateRunningBalance(transfer, index)} {token.symbol}
                                        </div>
                                    </div>
                                </div>
                                <div class="flex justify-between place-items-start mt-2">
                                    {#if transfer.note}
                                        <div class="md:pl-[12.5rem]">
                                            <div class="text-gray-500 dark:text-gray-400 font-medium text-xs">Tx Note</div>
                                            <div class="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap break-words">
                                                {transfer.note}
                                            </div>
                                        </div>
                                    {:else}
                                        <div class="md:pl-[12.5rem]"></div>
                                    {/if}
                                    <a 
                                        href={`https://explorer.voi.network/explorer/transaction/${Buffer.from(transfer.transactionid, 'hex').toString('utf8')}`}
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