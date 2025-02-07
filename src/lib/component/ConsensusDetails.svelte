<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { fade } from 'svelte/transition';
    import { getConsensusInfo } from '$lib/stores/accounts';
    import InfoButton from './ui/InfoButton.svelte';

    export let walletAddress: string;
    export let accountStatus: string;
    export let accountBalance: number;
    export let autoRefresh = true;
    export let refreshInterval = 10000;
    export let voteKeyExpiry: number | undefined = undefined;
    export let voteKeyExpiryDate: Date | undefined = undefined;

    let isConsensusDetailsExpanded = false;
    let consensusDetails: {
        first_block: number;
        last_block: number;
        last_vote_block: number;
        last_vote_timestamp: string;
        total_blocks: number;
        vote_count: number;
    } | undefined;
    let consensusHealth: 'good' | 'warning' | 'error' | 'unknown' | undefined;
    let timeSinceLastVote: number | undefined;
    let lastVoteTimestamp: number | undefined;
    let voteTimeInterval: ReturnType<typeof setInterval> | null = null;
    let consensusUpdateInterval: ReturnType<typeof setInterval> | null = null;
    let initialUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

    interface ConsensusThreshold {
        minBalance: number;
        timeThresholds: {
            error: number;
            warning: number;
        };
    }

    const consensusThresholds: ConsensusThreshold[] = [
        {
            minBalance: 1_000_000,
            timeThresholds: {
                error: 600,    // 10 minutes
                warning: 300,  // 5 minutes
            }
        },
        {
            minBalance: 100_000,
            timeThresholds: {
                error: 1800,   // 30 minutes
                warning: 1200, // 20 minutes
            }
        },
        {
            minBalance: 10_000,
            timeThresholds: {
                error: 7200,   // 2 hours
                warning: 3600, // 1 hour
            }
        },
        {
            minBalance: 1_000,
            timeThresholds: {
                error: 86400,  // 1 day
                warning: 10800, // 3 hours
            }
        }
    ];

    function updateConsensusHealth(timeSinceLastVote: number, balanceInVoi: number) {
        if (balanceInVoi < 1_000 && timeSinceLastVote > 86400) {
            consensusHealth = 'unknown';
            return;
        }

        // Find the applicable threshold based on balance
        const threshold = consensusThresholds.find(t => balanceInVoi >= t.minBalance);

        if (!threshold) {
            consensusHealth = 'good';
            return;
        }

        if (timeSinceLastVote > threshold.timeThresholds.error) {
            consensusHealth = 'error';
        } else if (timeSinceLastVote > threshold.timeThresholds.warning) {
            consensusHealth = 'warning';
        } else {
            consensusHealth = 'good';
        }
    }

    async function updateConsensusDetails() {
        if (!walletAddress || accountStatus !== 'Online') return;

        try {
            const updatedConsensus = await getConsensusInfo(walletAddress, true);
            if (updatedConsensus) {
                consensusDetails = updatedConsensus;
                if (updatedConsensus.last_vote_timestamp) {
                    lastVoteTimestamp = new Date(updatedConsensus.last_vote_timestamp).getTime();
                    timeSinceLastVote = (Date.now() - lastVoteTimestamp) / 1000;
                    updateConsensusHealth(timeSinceLastVote, accountBalance / 1e6);
                }
            }
        } catch (error) {
            console.error('Error updating consensus details:', error);
        }
    }

    // Watch for changes in isConsensusDetailsExpanded
    $: if (isConsensusDetailsExpanded !== undefined) {
        if (consensusUpdateInterval) {
            clearInterval(consensusUpdateInterval);
            consensusUpdateInterval = null;
        }
        
        if (isConsensusDetailsExpanded && autoRefresh) {
            // Initial update when expanded
            updateConsensusDetails();
            // Then start the regular interval
            consensusUpdateInterval = setInterval(updateConsensusDetails, refreshInterval);
        }
    }

    // Watch for changes in walletAddress - single update when wallet changes
    $: if (walletAddress && accountStatus === 'Online') {
        updateConsensusDetails();
    }

    onMount(() => {
        // Initial single update on mount
        if (accountStatus === 'Online' && walletAddress) {
            updateConsensusDetails();
        }

        // Update time since last vote every second, but only update health if we have consensus details
        voteTimeInterval = setInterval(() => {
            if (lastVoteTimestamp !== undefined && consensusDetails) {
                timeSinceLastVote = (Date.now() - lastVoteTimestamp) / 1000;
                // Only update health if we have actual consensus details from an API call
                if (accountStatus === 'Online') {
                    updateConsensusHealth(timeSinceLastVote, accountBalance / 1e6);
                }
            }
        }, 1000);

        return () => {
            if (voteTimeInterval) {
                clearInterval(voteTimeInterval);
                voteTimeInterval = null;
            }
            if (consensusUpdateInterval) {
                clearInterval(consensusUpdateInterval);
                consensusUpdateInterval = null;
            }
            if (initialUpdateTimeout) {
                clearTimeout(initialUpdateTimeout);
                initialUpdateTimeout = null;
            }
        };
    });

    onDestroy(() => {
        if (voteTimeInterval) {
            clearInterval(voteTimeInterval);
            voteTimeInterval = null;
        }
        if (consensusUpdateInterval) {
            clearInterval(consensusUpdateInterval);
            consensusUpdateInterval = null;
        }
        if (initialUpdateTimeout) {
            clearTimeout(initialUpdateTimeout);
            initialUpdateTimeout = null;
        }
    });
</script>

<div class="flex items-center justify-end gap-2 mb-2">
    <InfoButton noAbsolute customTrigger buttonColor="dark:text-gray-400 text-gray-600">
        <div slot="trigger" class="flex items-center gap-2 cursor-help">
            <span class="w-2 h-2 rounded-full {accountStatus === 'Online' ? 'bg-green-500' : 'bg-gray-500'}"></span>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{accountStatus}</p>
        </div>
        {#if accountStatus === 'Online'}
            This account is participating in consensus and can earn block rewards. Click the voting status button for more details.
        {:else}
            This account is not participating in consensus. To earn block rewards, you need to register a participation key.
        {/if}
    </InfoButton>
    {#if accountStatus === 'Online' && consensusDetails}
        <button
            on:click={() => isConsensusDetailsExpanded = !isConsensusDetailsExpanded}
            class="text-sm px-2 py-1 rounded-md {consensusHealth === 'good' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 
            consensusHealth === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' : 
            consensusHealth === 'unknown' ? 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300' :
            'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'} hover:opacity-90 transition-opacity flex items-center gap-1"
        >
            <i class="fas fa-vote-yea text-xs"></i>
            <span>
                {#if consensusHealth === 'good'}
                    Voting Active
                {:else if consensusHealth === 'unknown'}
                    Status Unknown
                {:else}
                    Voting Inactive
                {/if}
            </span>
            <i class="fas fa-chevron-{isConsensusDetailsExpanded ? 'up' : 'down'} text-xs ml-1"></i>
        </button>
    {/if}
</div>

{#if accountStatus === 'Online' && consensusDetails && isConsensusDetailsExpanded}
    <div 
        class="mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-left"
        transition:fade={{ duration: 150 }}
    >
        <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
                <h4 class="font-medium text-gray-900 dark:text-white mb-2">Vote Key Status</h4>
                {#if voteKeyExpiry !== undefined && voteKeyExpiryDate}
                    <div class="space-y-1">
                        <div class="flex justify-between space-x-1">
                            <span class="text-gray-600 dark:text-gray-400">Expires In</span>
                            <span class="text-gray-900 dark:text-white">
                                {Math.floor(voteKeyExpiry / 86400)}d {Math.floor((voteKeyExpiry % 86400) / 3600)}h
                            </span>
                        </div>
                        <div class="flex justify-between space-x-1">
                            <span class="text-gray-600 dark:text-gray-400">Expiry Date</span>
                            <span class="text-gray-900 dark:text-white">
                                {voteKeyExpiryDate.toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                {/if}
            </div>
            <div>
                <h4 class="font-medium text-gray-900 dark:text-white mb-2">Voting Activity</h4>
                <div class="space-y-1">
                    <div class="flex justify-between">
                        <span class="text-gray-600 dark:text-gray-400">Total Votes</span>
                        <span class="text-gray-900 dark:text-white">{consensusDetails.vote_count.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600 dark:text-gray-400">Total Blocks</span>
                        <span class="text-gray-900 dark:text-white">{consensusDetails.total_blocks.toLocaleString()}</span>
                    </div>
                    {#if timeSinceLastVote !== undefined}
                        <div class="flex justify-between">
                            <span class="text-gray-600 dark:text-gray-400">Last Vote</span>
                            <span class="text-gray-900 dark:text-white">
                                {#if timeSinceLastVote < 60}
                                    {Math.floor(timeSinceLastVote)}s ago
                                {:else if timeSinceLastVote < 3600}
                                    {Math.floor(timeSinceLastVote / 60)}m {Math.floor(timeSinceLastVote % 60)}s ago
                                {:else if timeSinceLastVote < 86400}
                                    {Math.floor(timeSinceLastVote / 3600)}h {Math.floor((timeSinceLastVote % 3600) / 60)}m ago
                                {:else}
                                    {Math.floor(timeSinceLastVote / 86400)}d {Math.floor((timeSinceLastVote % 86400) / 3600)}h ago
                                {/if}
                            </span>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
        {#if consensusHealth === 'warning' || consensusHealth === 'error' || consensusHealth === 'unknown'}
            <div class="mt-3 p-2 rounded {consensusHealth === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/20' : 
            consensusHealth === 'unknown' ? 'bg-gray-100 dark:bg-gray-900/20' :
            'bg-red-100 dark:bg-red-900/20'}">
                <div class="flex items-center">
                    <i class="fas {consensusHealth === 'unknown' ? 'fa-info-circle' : 'fa-exclamation-triangle'} 
                    {consensusHealth === 'warning' ? 'text-yellow-500' : 
                    consensusHealth === 'unknown' ? 'text-gray-500' :
                    'text-red-500'} mr-2"></i>
                    <p class="text-xs {consensusHealth === 'warning' ? 'text-yellow-700 dark:text-yellow-200' : 
                    consensusHealth === 'unknown' ? 'text-gray-700 dark:text-gray-200' :
                    'text-red-700 dark:text-red-200'}">
                        {#if consensusHealth === 'unknown'}
                            Due to your current stake being less than 1,000 VOI, we cannot accurately estimate voting health.
                        {:else if consensusHealth === 'warning'}
                            Your node's voting frequency is slower than expected for your stake size. This might affect your rewards.
                        {:else}
                            Your node has not voted in a significant period. Please check your node's status immediately.
                        {/if}
                    </p>
                </div>
            </div>
        {/if}
    </div>
{/if} 