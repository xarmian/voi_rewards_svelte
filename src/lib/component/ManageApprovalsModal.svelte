<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { FungibleTokenType, OutgoingApproval } from '$lib/types/assets';
    import { arc200Approve, arc200RevokeApproval, fetchOutgoingApprovals } from '$lib/utils/arc200';
    import { selectedWallet } from 'avm-wallet-svelte';
    import { signTransactions } from 'avm-wallet-svelte';
    import { onMount } from 'svelte';
    import algosdk from 'algosdk';
    import WalletSearch from './WalletSearch.svelte';

    const dispatch = createEventDispatcher();

    export let open = false;
    export let token: FungibleTokenType;
    export let walletId: string | undefined;

    let isLoading = false;
    let isRevoking: string | null = null;
    let isApproving = false;
    let approvalError: string | null = null;
    let approvalSuccess = false;
    let successTxId: string | null = null;
    let isRefreshing = false;
    
    let spenderAddress = '';
    let approvalAmount = '';
    let outgoingApprovals: OutgoingApproval[] = [];
    let refreshTrigger = 0; // Used to trigger re-fetches
    let hasChanges = false; // Track if any changes were made
    
    $: canSignTransactions = $selectedWallet?.address === walletId && $selectedWallet?.app !== '' && $selectedWallet?.app !== 'Watch';
    $: isArc200 = token.type === 'arc200';
    $: initialApprovals = token.outgoingApprovals || [];
    $: tokenName = token.name;
    $: tokenSymbol = token.symbol;
    $: tokenDecimals = token.decimals;
    
    // Format approval amount with proper decimals
    function formatTokenAmount(amount: string, decimals: number): string {
        if (!amount) return '0';
        const amountNum = Number(amount);
        return (amountNum / Math.pow(10, decimals)).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: decimals
        });
    }
    
    // Convert entered amount to raw token units
    function parseTokenAmount(amount: string, decimals: number): bigint {
        if (!amount) return BigInt(0);
        const cleanAmount = amount.replace(/,/g, '');
        const floatAmount = parseFloat(cleanAmount);
        return BigInt(Math.floor(floatAmount * Math.pow(10, decimals)));
    }
    
    // Format date for display
    function formatDate(timestamp: number): string {
        return new Date(timestamp * 1000).toLocaleDateString();
    }
    
    // Load approvals when modal opens
    $: if (open && walletId && isArc200) {
        loadApprovals();
    }
    
    // Also trigger refresh when refreshTrigger changes
    $: if (refreshTrigger > 0 && open && walletId && isArc200) {
        loadApprovals();
    }
    
    async function loadApprovals() {
        if (!walletId) return;
        
        isLoading = true;
        approvalError = null;
        
        try {
            // Fetch outgoing approvals for this token
            const allApprovals = await fetchOutgoingApprovals(walletId);
            outgoingApprovals = allApprovals.filter(approval => 
                approval.contractId.toString() === token.id
            );
        } catch (error) {
            console.error('Error loading approvals:', error);
            approvalError = error instanceof Error ? error.message : 'Failed to load approvals';
        } finally {
            isLoading = false;
        }
    }
    
    async function handleCreateApproval() {
        if (!walletId || !canSignTransactions || !spenderAddress || !approvalAmount) {
            approvalError = 'Please fill in all fields';
            return;
        }
        
        try {
            isApproving = true;
            approvalError = null;
            approvalSuccess = false;
            successTxId = null;
            
            // Validate spender address
            if (!algosdk.isValidAddress(spenderAddress)) {
                throw new Error('Invalid spender address');
            }
            
            // Parse amount
            const rawAmount = parseTokenAmount(approvalAmount, tokenDecimals);
            
            // Call API to create approval
            const result = await arc200Approve(
                Number(token.id),
                spenderAddress,
                rawAmount,
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
                throw new Error(result.error || 'Failed to create approval');
            }
            
            // Handle success
            approvalSuccess = true;
            successTxId = result.txId;
            spenderAddress = '';
            approvalAmount = '';
            hasChanges = true;
            
            // Refresh the approvals list
            refreshTrigger++;
            
        } catch (error) {
            console.error('Error creating approval:', error);
            approvalError = error instanceof Error ? error.message : 'Failed to create approval';
        } finally {
            isApproving = false;
        }
    }

    // Handle spender address selection from WalletSearch
    function handleSpenderSelected(address: string) {
        spenderAddress = address;
    }
    
    async function handleRevokeApproval(approval: OutgoingApproval) {
        if (!walletId || !canSignTransactions) return;
        
        try {
            isRevoking = approval.transactionId;
            approvalError = null;
            approvalSuccess = false;
            successTxId = null;
            
            // Call API to revoke approval
            const result = await arc200RevokeApproval(
                Number(token.id),
                approval.spender,
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
                throw new Error(result.error || 'Failed to revoke approval');
            }
            
            // Handle success
            approvalSuccess = true;
            successTxId = result.txId;
            hasChanges = true;
            
            // Refresh the approvals list
            refreshTrigger++;
            
        } catch (error) {
            console.error('Error revoking approval:', error);
            approvalError = error instanceof Error ? error.message : 'Failed to revoke approval';
        } finally {
            isRevoking = null;
        }
    }
    
    async function refreshApprovals() {
        if (isRefreshing) return;
        
        isRefreshing = true;
        try {
            await loadApprovals();
        } finally {
            isRefreshing = false;
        }
    }
    
    function closeModal() {
        if (hasChanges) {
            // Only dispatch events if changes were made
            dispatch('approvalChanged');
        }
        open = false;
    }
</script>

{#if open}
<div class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="p-5">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
                    Manage Approvals for {tokenName} ({tokenSymbol})
                </h3>
                <button 
                    on:click={closeModal}
                    class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    title="Close"
                    aria-label="Close"
                >
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <!-- Explanation about approvals -->
            <div class="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg mb-4 text-sm">
                <p class="text-blue-800 dark:text-blue-300">
                    <i class="fas fa-info-circle mr-2"></i>
                    Approvals allow you to designate another account to spend or claim a set amount of your tokens. 
                    The tokens remain in your account until the approved spender claims them.
                </p>
            </div>
            
            {#if !isArc200}
                <div class="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 p-4 rounded-lg mb-4">
                    <p>Approvals are only available for ARC-200 tokens.</p>
                </div>
            {:else}
                <!-- Create new approval section -->
                <div class="mb-6 border-b border-gray-200 dark:border-gray-700 pb-6">
                    <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-3">Create New Approval</h4>
                    
                    <div class="space-y-4">
                        <div>
                            <label for="spender" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Spender Address
                            </label>
                            <WalletSearch
                                onSubmit={handleSpenderSelected}
                                loadPreviousValue={false}
                                storeAddress={false}
                                clearOnSubmit={false}
                                hideSubmitButton={true}
                                searchText={spenderAddress}
                            />
                        </div>
                        
                        <div>
                            <label for="amount" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Amount
                            </label>
                            <div class="flex items-center">
                                <input 
                                    type="text" 
                                    id="amount" 
                                    bind:value={approvalAmount}
                                    placeholder="Enter amount"
                                    class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-l-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                                    disabled={isApproving}
                                />
                                <span class="px-3 py-2 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-md bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                                    {tokenSymbol}
                                </span>
                            </div>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Your balance: {formatTokenAmount(token.balance.toString(), tokenDecimals)} {tokenSymbol}
                            </p>
                        </div>
                        
                        <button
                            on:click={handleCreateApproval}
                            class="w-full px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                            disabled={isApproving || !canSignTransactions || !spenderAddress || !approvalAmount}
                        >
                            {#if isApproving}
                                <div class="w-4 h-4 border-t-2 border-r-2 border-white rounded-full animate-spin mr-2"></div>
                                Creating Approval...
                            {:else}
                                Create Approval
                            {/if}
                        </button>
                        
                        {#if !canSignTransactions}
                            <p class="text-xs text-red-500 mt-1">
                                Connect your wallet to create new approvals.
                            </p>
                        {/if}
                    </div>
                </div>
                
                <!-- Existing approvals section -->
                <div>
                    <div class="flex justify-between items-center mb-3">
                        <h4 class="text-lg font-medium text-gray-900 dark:text-white">Existing Approvals</h4>
                        
                        <button
                            on:click={refreshApprovals}
                            class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isLoading || isRefreshing}
                            title="Refresh approvals"
                        >
                            {#if isRefreshing}
                                <div class="w-3 h-3 border-t-2 border-r-2 border-blue-500 rounded-full animate-spin"></div>
                            {:else}
                                <i class="fas fa-sync-alt"></i>
                            {/if}
                            Refresh
                        </button>
                    </div>
                    
                    {#if isLoading}
                        <div class="flex justify-center items-center py-8">
                            <div class="w-6 h-6 border-t-2 border-r-2 border-blue-500 rounded-full animate-spin"></div>
                        </div>
                    {:else if outgoingApprovals.length === 0}
                        <p class="text-gray-500 dark:text-gray-400 text-center py-4">
                            No approvals found for this token.
                        </p>
                    {:else}
                        <div class="space-y-4 max-h-60 overflow-y-auto">
                            {#each outgoingApprovals as approval}
                                <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                                    <div class="grid grid-cols-2 gap-2 text-sm">
                                        <div class="col-span-2">
                                            <span class="text-gray-500 dark:text-gray-400">Spender:</span>
                                            <a 
                                                href={`https://voiager.xyz/account/${approval.spender}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-mono text-xs truncate ml-1"
                                            >
                                                {approval.spender}
                                            </a>
                                        </div>
                                        <div>
                                            <span class="text-gray-500 dark:text-gray-400">Amount:</span>
                                            <span class="text-gray-700 dark:text-gray-200 ml-1">
                                                {formatTokenAmount(approval.amount, tokenDecimals)} {tokenSymbol}
                                            </span>
                                        </div>
                                        <div>
                                            <span class="text-gray-500 dark:text-gray-400">Date:</span>
                                            <span class="text-gray-700 dark:text-gray-200 ml-1">
                                                {formatDate(approval.timestamp)}
                                            </span>
                                        </div>
                                        <div class="col-span-2 mt-2 flex justify-between items-center">
                                            <a 
                                                href={`https://voiager.xyz/transaction/${approval.transactionId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-xs"
                                            >
                                                <i class="fas fa-external-link-alt mr-1"></i>
                                                View Transaction
                                            </a>
                                            
                                            {#if canSignTransactions}
                                                <button
                                                    on:click={() => handleRevokeApproval(approval)}
                                                    class="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    disabled={isRevoking !== null}
                                                >
                                                    {#if isRevoking === approval.transactionId}
                                                        <div class="w-3 h-3 border-t-2 border-r-2 border-white rounded-full animate-spin mr-1"></div>
                                                        Revoking...
                                                    {:else}
                                                        <i class="fas fa-times"></i>
                                                        Revoke
                                                    {/if}
                                                </button>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
            
            {#if approvalError}
                <div class="mt-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg">
                    <p class="text-sm">{approvalError}</p>
                </div>
            {/if}
            
            {#if approvalSuccess && successTxId}
                <div class="mt-4 p-3 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-lg">
                    <p class="text-sm">
                        Transaction successful! 
                        <a 
                            href={`https://voiager.xyz/transaction/${successTxId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="underline hover:text-green-800 dark:hover:text-green-200"
                        >
                            View transaction
                        </a>
                    </p>
                </div>
            {/if}
            
            <div class="mt-6 flex justify-between">
                <p class="text-xs text-gray-500 dark:text-gray-400 self-center">
                    {#if hasChanges}
                        Approvals may take a few seconds to update. Use refresh button to check for changes.
                    {/if}
                </p>
                <button
                    on:click={closeModal}
                    class="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md"
                >
                    Close
                </button>
            </div>
        </div>
    </div>
</div>
{/if} 