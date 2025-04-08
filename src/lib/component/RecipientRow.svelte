<script lang="ts">
    import { Input } from 'flowbite-svelte';
    import WalletSearch from './WalletSearch.svelte';
    import type { FungibleTokenType } from '$lib/types/assets';
    import { algodClient, algodIndexer } from '$lib/utils/algod';
    import { arc200 as Contract } from 'ulujs';
    import { fade } from 'svelte/transition';
    import { onMount } from 'svelte';
    import type { Recipient } from '$lib/types/recipients';

    export let recipient: Recipient;
    export let index: number;
    export let isLastRecipient: boolean;
    export let selectedToken: FungibleTokenType | { 
        type: 'native';
        symbol: 'VOI';
        decimals: number;
        balance: number;
        name: string;
        id?: undefined;
    };
    export let maxAmount: number;
    export let onRemove: (index: number) => void;
    export let onAmountChange: (index: number, amount: string) => void;
    export let onNoteChange: (index: number, note: string) => void;
    export let onError: (message: string | null) => void = () => {};

    // State for note field visibility
    let isNoteVisible = false;

    // Reference to the note popup element
    let notePopupRef: HTMLElement;
    // Reference to the note button element
    let noteButtonRef: HTMLElement;
    // Reference to the note input element
    let noteInputRef: HTMLInputElement;

    // Helper functions
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

    // Helper function to determine if token is native VOI
    function isNativeToken(token: any): boolean {
        return token.type === 'native';
    }

    // Helper function to determine if token is ARC-200
    function isARC200Token(token: any): boolean {
        return token.type === 'arc200';
    }

    async function fetchRecipientInfo(address: string) {
        recipient.isLoading = true;
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

            recipient.info = {
                balance: accountInfo.amount,
                createdAt: new Date(block.timestamp * 1000).toLocaleDateString(),
                hasOptedIn,
                assetBalance
            };

            recipient.isValid = true;
            onError(null);
        } catch (err) {
            console.error('Error fetching recipient info:', err);
            recipient.info = null;
            recipient.isValid = false;
            onError('Failed to fetch recipient info. Please try again later.');
        } finally {
            recipient.isLoading = false;
        }
    }

    async function handleRecipientSelected(address: string) {
        if (address === recipient.address) return;
        if (address === '') {
            recipient.address = null;
            recipient.info = null;
            recipient.isValid = false;
            return;
        }
        recipient.address = address;
        onError(null);
        await fetchRecipientInfo(address);
    }

    function handleAmountChange(e: Event) {
        const input = e.target as HTMLInputElement;
        const newAmount = enforceDecimals(input.value, selectedToken.decimals);
        recipient.amount = newAmount;
        onAmountChange(index, newAmount);
    }

    function handleNoteChange(e: Event) {
        const input = e.target as HTMLInputElement;
        recipient.note = input.value;
        onNoteChange(index, input.value);
    }
    
    // Click outside handler
    function handleClickOutside(event: MouseEvent) {
        if (isNoteVisible && notePopupRef && noteButtonRef && 
            !notePopupRef.contains(event.target as Node) && 
            !noteButtonRef.contains(event.target as Node)) {
            isNoteVisible = false;
        }
    }

    // Mount the click outside event listener
    onMount(() => {
        document.addEventListener('click', handleClickOutside);
        
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    });

    function handleNoteKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
            isNoteVisible = false;
        }
    }

    // Calculate the best position for the popup
    function calculatePopupPosition() {
        if (!noteButtonRef) return { left: 0, top: 0 };
        
        const buttonRect = noteButtonRef.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // Default position - centered below button
        let left = buttonRect.left - 230 + buttonRect.width/2;
        let top = buttonRect.bottom + 5;
        
        // Make sure the popup doesn't go off screen to the left
        left = Math.max(20, left);
        
        // Make sure the popup doesn't go off screen to the right
        // 72 * 4 = 288px (width of popup)
        left = Math.min(left, windowWidth - 290);
        
        // If the popup would go off the bottom of the screen, show it above the button
        if (top + 200 > windowHeight) {
            top = buttonRect.top - 210; // 200px for popup height + 10px margin
        }
        
        return { left, top };
    }

    // Clear the note
    function clearNote() {
        recipient.note = '';
        onNoteChange(index, '');
    }

    // Toggle note visibility
    function toggleNoteVisibility() {
        isNoteVisible = !isNoteVisible;
        // Focus the input when opening
        if (isNoteVisible) {
            setTimeout(() => {
                if (noteInputRef) {
                    noteInputRef.focus();
                }
            }, 50);
        }
    }
</script>

<div class="p-3 relative">
    {#if !isLastRecipient}
        <button
            class="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors duration-150"
            on:click={() => onRemove(index)}
            title="Remove recipient"
            aria-label="Remove recipient"
        >
            <i class="fas fa-times"></i>
        </button>
    {/if}
    <div class="flex-1 pr-8">
        <div class="grid grid-cols-[minmax(200px,1fr),minmax(80px,120px)] sm:grid-cols-[minmax(280px,420px),120px,auto] gap-2 sm:gap-4">
            <!-- Recipient Column -->
            <div class="space-y-2">
                <WalletSearch
                    onSubmit={(addr) => handleRecipientSelected(addr)}
                    loadPreviousValue={false}
                    storeAddress={false}
                    clearOnSubmit={false}
                    hideSubmitButton={true}
                    searchText={recipient.address || ''}
                />
                <div class="relative">
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
                                    
                                    {#if !isNativeToken(selectedToken)}
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs text-gray-500 dark:text-gray-400">{selectedToken.symbol}:</span>
                                            <span class="text-sm text-gray-700 dark:text-gray-300">
                                                {((recipient.info.assetBalance ?? 0) / Math.pow(10, selectedToken.decimals)).toLocaleString()}
                                            </span>
                                        </div>
                                    {/if}

                                    {#if !isARC200Token(selectedToken) && !isNativeToken(selectedToken)}
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

            <!-- Amount Column with Note Icon -->
            <div>
                <div class="relative flex items-center gap-2">
                    <div class="flex-grow relative">
                        <Input
                            type="number"
                            bind:value={recipient.amount}
                            min="0"
                            max={maxAmount}
                            step={`${1/Math.pow(10, selectedToken.decimals)}`}
                            placeholder={`${selectedToken.symbol}`}
                            on:input={handleAmountChange}
                        />
                        {#if !recipient.amount || Number(recipient.amount) < maxAmount}
                            <button
                                type="button" 
                                class="hidden sm:absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded"
                                on:click={() => {
                                    recipient.amount = maxAmount.toString();
                                    onAmountChange(index, maxAmount.toString());
                                }}
                            >
                                MAX
                            </button>
                        {/if}
                    </div>
                    
                    <div class="relative flex-shrink-0">
                        <button
                            type="button"
                            class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 {recipient.note ? 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-500 dark:text-gray-400'}"
                            on:click={toggleNoteVisibility}
                            title="{recipient.note ? 'Edit note' : 'Add note'}"
                            aria-label="{recipient.note ? 'Edit note' : 'Add note'}"
                            bind:this={noteButtonRef}
                        >
                            <i class="fas fa-comment-alt text-sm"></i>
                            {#if recipient.note}
                                <span class="absolute top-0 right-0 block w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full"></span>
                            {/if}
                        </button>
                        
                        {#if isNoteVisible}
                            <div 
                                class="fixed z-50 w-72 rounded-md shadow-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" 
                                style="left: {calculatePopupPosition().left}px; top: {calculatePopupPosition().top}px;"
                                transition:fade={{ duration: 150 }}
                                bind:this={notePopupRef}
                            >
                                <!-- Add a small arrow to point to the button -->
                                <div class="absolute -top-2 right-6 w-4 h-4 bg-white dark:bg-gray-800 border-t border-l border-gray-200 dark:border-gray-700 transform rotate-45"></div>
                                
                                <div class="p-3 relative">
                                    <div class="flex justify-between items-center mb-2">
                                        <label for="note-{index}" class="block text-xs font-medium text-gray-700 dark:text-gray-300">Add a note for this recipient</label>
                                        {#if recipient.note}
                                            <button 
                                                type="button"
                                                class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                                                on:click={clearNote}
                                                title="Clear note"
                                                aria-label="Clear note"
                                            >
                                                <i class="fas fa-times text-xs"></i>
                                            </button>
                                        {/if}
                                    </div>
                                    <div class="relative">
                                        <input
                                            id="note-{index}"
                                            type="text"
                                            bind:value={recipient.note}
                                            bind:this={noteInputRef}
                                            placeholder="Note (optional)"
                                            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                                            maxlength={1000}
                                            on:input={handleNoteChange}
                                            on:keydown={handleNoteKeydown}
                                        />
                                    </div>
                                    <div class="flex justify-between items-center mt-2">
                                        <span class="text-xs text-gray-500 dark:text-gray-400">
                                            {(recipient.note?.length || 0)}/1000
                                        </span>
                                        <button 
                                            type="button"
                                            class="text-xs px-2 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium"
                                            on:click={() => isNoteVisible = false}
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    </div>
</div> 