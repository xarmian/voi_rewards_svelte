<script lang="ts">
    import { StarSolid, StarOutline } from 'flowbite-svelte-icons';
    import { favorites } from '../../../stores/favorites';
    import { copy } from 'svelte-copy';
    import { toast } from '@zerodevx/svelte-toast';
    import { selectedWallet } from 'avm-wallet-svelte';
    import { nicknames } from '$lib/stores/nicknames';
    import NicknameManager from '$lib/components/NicknameManager.svelte';
	import CopyComponent from '$lib/component/ui/CopyComponent.svelte';

    export let addressLink: boolean = false;

    export let account: {
        address: string;
        isParticipating: boolean;
        balance: number;
        blocksProduced24h: number;
        expectedBlocksPerDay: number;
        expectedBlocksPerWeek: number;
        expectedBlocksPerMonth: number;
        estimatedRewardsPerDay: number;
        estimatedRewardsPerWeek: number;
        estimatedRewardsPerMonth: number;
    };

    let isExpanded = false;
    let showNicknameInput = false;
    let showOfflineInfo = false;

    const blockPeriods = [
        { period: 'Daily', amount: account.expectedBlocksPerDay, rewards: account.estimatedRewardsPerDay },
        { period: 'Weekly', amount: account.expectedBlocksPerWeek, rewards: account.estimatedRewardsPerWeek },
        { period: 'Monthly', amount: account.expectedBlocksPerMonth, rewards: account.estimatedRewardsPerMonth }
    ];

    function setAccount(address: string) {
        selectedWallet.set({
            address: address,
            app: ''
        });
    }

    function toggleExpand() {
        isExpanded = !isExpanded;
    }

    function toggleOfflineInfo() {
        showOfflineInfo = !showOfflineInfo;
    }
</script>

<div class="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 space-y-6 relative">
    <!-- Header Section with Address and Balance -->
    <div 
        class="w-full flex flex-col gap-2 md:gap-0 md:block cursor-pointer"
        on:click={toggleExpand}
        on:keydown={(e) => e.key === 'Enter' && toggleExpand()}
        role="button"
        tabindex="0"
    >
        <div class="flex justify-between items-start">
            <div class="space-y-2">
                <div class="flex items-center gap-2">
                    {#if addressLink}
                        <button 
                            class="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-mono text-sm"
                            on:click|stopPropagation={() => setAccount(`${account.address}`)}
                        >
                            {#if $nicknames[account.address]}
                                {$nicknames[account.address]}
                            {:else}
                                {account.address.substring(0, 12)}...{account.address.substring(account.address.length - 8)}
                            {/if}
                        </button>
                    {:else}
                        <span class="font-mono text-sm text-gray-700 dark:text-gray-300">
                            {#if $nicknames[account.address]}
                                {$nicknames[account.address]}
                            {:else}
                                {account.address.substring(0, 12)}...{account.address.substring(account.address.length - 8)}
                            {/if}
                        </span>
                    {/if}
                    
                    <div class="flex items-center gap-1">
                        <CopyComponent 
                            text={account.address}
                            toastMessage={`Address copied to clipboard`}
                            failureMessage={`Failed to copy address to clipboard`}
                        />
                        <a 
                            href={`https://explorer.voi.network/explorer/account/${account.address}`}
                            target="_blank"
                            on:click|stopPropagation
                            class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                            title="View on Explorer"
                            aria-label="View account on Explorer"
                        >
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                        
                        <button 
                            on:click|stopPropagation={() => favorites.toggle(account.address)}
                            class="hover:scale-110 transition-transform"
                            title={$favorites.includes(account.address) ? "Remove from favorites" : "Add to favorites"}
                        >
                            {#if $favorites.includes(account.address)}
                                <StarSolid class="w-4 h-4 text-yellow-300" />
                            {:else}
                                <StarOutline class="w-4 h-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300" />
                            {/if}
                        </button>

                        <button 
                            on:click|stopPropagation={() => showNicknameInput = !showNicknameInput}
                            class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                            title="Set Nickname"
                            aria-label="Set Nickname"
                        >
                            <i class="fas fa-tag"></i>
                        </button>
                    </div>
                </div>

                {#if showNicknameInput}
                    <div 
                        class="mt-2" 
                        on:click|stopPropagation 
                        on:keydown|stopPropagation={(e) => e.key === 'Enter' && e.stopPropagation()}
                        role="presentation"
                    >
                        <NicknameManager 
                            address={account.address} 
                            bind:showInput={showNicknameInput}
                        />
                    </div>
                {/if}
                
                <div class="flex items-center gap-2">
                    <span class={`px-2 py-0.5 text-sm rounded-full ${
                        account.isParticipating 
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                    }`}>
                        {account.isParticipating ? 'Online' : 'Offline'}
                    </span>
                    {#if !account.isParticipating}
                        <button
                            on:click|stopPropagation={toggleOfflineInfo}
                            class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 absolute top-4 right-4 text-xl"
                            title="Account offline info"
                            aria-label="Show offline account information"
                        >
                            <i class="fas fa-triangle-exclamation fa-lg"></i>
                        </button>
                    {/if}
                    <span class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {account.balance.toLocaleString()} VOI
                    </span>
                </div>
            </div>
            <div class="md:hidden transform transition-transform duration-200 absolute top-5 right-5" class:rotate-180={isExpanded}>
                <i class="fas fa-chevron-down text-gray-400"></i>
            </div>
        </div>
    </div>

    <!-- Metrics Grid - Hidden by default on mobile -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4" class:hidden={!isExpanded} class:md:grid={true}>
        {#each blockPeriods as { period, amount, rewards }}
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 transition-all hover:shadow-md">
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {period} Estimates
                </h3>
                <div class="space-y-2">
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Blocks</p>
                        <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {amount.toLocaleString()}
                        </p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Rewards</p>
                        <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {rewards.toLocaleString()} VOI
                        </p>
                    </div>
                </div>
            </div>
        {/each}
    </div>
</div>

{#if showOfflineInfo}
    <div 
        class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" 
        on:click|self={toggleOfflineInfo}
        on:keydown={(e) => e.key === 'Enter' && toggleOfflineInfo()}
        role="button"
        tabindex="0"
    >
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full shadow-xl">
            <div class="flex justify-between items-start mb-4">
                <h3 class="text-lg font-semibold dark:text-gray-100">Offline Account Status</h3>
                <button 
                    on:click={toggleOfflineInfo}
                    class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    aria-label="Close offline status modal"
                >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="space-y-4">
                <p class="text-gray-600 dark:text-gray-300">
                    This account is currently offline and not participating in consensus. The values shown are estimates of what could be earned if the account was participating in consensus.
                </p>
                <p class="text-gray-600 dark:text-gray-300">
                    To start earning rewards, you'll need to set up and run a participation node.
                </p>
                <a 
                    href="/faq#how-do-i-get-started-running-a-node-"
                    class="inline-block text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-medium"
                >
                    Learn how to get started running a node →
                </a>
            </div>
        </div>
    </div>
{/if}
