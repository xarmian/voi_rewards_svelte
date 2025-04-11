<script lang="ts">
    import type { ContractDetails } from '$lib/types';
    import { selectedWallet } from 'avm-wallet-svelte';

    export let contract: ContractDetails;
    export let onWithdrawClick: (contract: ContractDetails) => void;
    export let onRegisterVoteKeyClick: (contract: ContractDetails) => void;

    $: isWatchAccount = ($selectedWallet?.app || 'Watch') === 'Watch';
    let isExpanded = false;

    function formatNumber(num: number): string {
        return new Intl.NumberFormat('en-US', {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2
        }).format(num / 1_000_000); // Convert from microVOI to VOI
    }

    function formatDate(date: Date): string {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        }).format(date);
    }

    function formatDuration(seconds: number): string {
        // Convert to milliseconds and show in months, rounded
        const ms = seconds * 1000;
        const months = Math.round(ms / (30.44 * 24 * 60 * 60 * 1000));
        return `${months} month`;
    }

    function truncateAddress(address: string): string {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    function handleWithdrawClick(contract: ContractDetails) {
        onWithdrawClick(contract);
    }

    function handleRegisterVoteKey(contract: ContractDetails) {
        onRegisterVoteKeyClick(contract);
    }
</script>

<div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
    <!-- Contract Header -->
    <div class="px-4 lg:px-6 py-3 lg:py-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 lg:gap-4 w-full justify-between">
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        <h3 class="text-lg lg:text-xl font-bold text-gray-900 dark:text-white">Lock Contract</h3>
                        <a 
                            href={`https://explorer.voi.network/explorer/application/${contract.contractId}`} 
                            target="_blank" 
                            class="text-blue-500 hover:text-blue-600 transition-colors"
                            aria-label="View Contract on Explorer"
                        >
                            {contract.contractId}
                            <i class="fas fa-external-link-alt text-sm"></i>
                        </a>
                    </div>
                    <p class="hidden lg:block text-sm text-gray-600 dark:text-gray-300">
                        <span class="font-medium">Address:</span>{' '}
                        <a 
                            href={`https://explorer.voi.network/explorer/account/${contract.contractAddress}`} 
                            target="_blank" 
                            class="text-blue-500 hover:text-blue-600 transition-colors"
                            aria-label="View Account on Explorer"
                        >
                            {truncateAddress(contract.contractAddress)}
                        </a>
                    </p>
                </div>
                <div class="flex gap-2">
                    <span class={`inline-flex items-center px-2 lg:px-3 py-0.5 lg:py-1 rounded-full text-xs lg:text-sm font-medium ${
                        contract.isParticipating
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                    }`}>
                        <i class={`fas ${contract.isParticipating ? 'fa-check-circle' : 'fa-times-circle'} mr-1 lg:mr-1.5`}></i>
                        {contract.isParticipating ? 'Staking' : 'Not Staking'}
                    </span>
                    <span class={`inline-flex items-center px-2 lg:px-3 py-0.5 lg:py-1 rounded-full text-xs lg:text-sm font-medium ${
                        contract.isFullyVested
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                    }`}>
                        <i class={`fas ${contract.isFullyVested ? 'fa-lock' : 'fa-clock'} mr-1 lg:mr-1.5`}></i>
                        {contract.isFullyVested ? 'Vested' : 'Vesting'}
                    </span>
                </div>
            </div>
            <button 
                class="lg:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                on:click={() => isExpanded = !isExpanded}
                aria-label={isExpanded ? "Collapse details" : "Expand details"}
            >
                <i class={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
            </button>
        </div>
    </div>

    <!-- Essential Info -->
    <div class="p-4 lg:p-6">
        <div class="lg:grid lg:grid-cols-3 lg:gap-6 space-y-4 lg:space-y-0">
            <!-- Balance Section -->
            <div class="space-y-4">
                <div class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                    <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Balance</h4>
                    <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <span class="text-gray-600 dark:text-gray-300">Available</span>
                            <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.availableForWithdrawal)} VOI</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-gray-600 dark:text-gray-300">Total</span>
                            <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.balance)} VOI</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-gray-600 dark:text-gray-300">Locked</span>
                            <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.lockedBalance)} VOI</span>
                        </div>
                    </div>
                </div>
                {#if contract.availableForWithdrawal > 0}
                    <button
                        on:click={() => handleWithdrawClick(contract)}
                        class="w-full inline-flex justify-center items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isWatchAccount}
                    >
                        <i class="fas fa-wallet mr-2"></i>
                        Withdraw from Available Balance
                    </button>
                {/if}
            </div>

            <!-- Vesting Section -->
            <div class="lg:block {!isExpanded ? 'hidden' : ''} bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Vesting</h4>
                <div class="space-y-2">
                    <div class="flex justify-between items-center">
                        <span class="text-gray-600 dark:text-gray-300">Terms</span>
                        <span class="font-medium text-gray-900 dark:text-white">{formatDuration(contract.lockupPeriod)} Lock / {formatDuration(contract.vestingPeriod)} Vest</span>
                    </div>
                    {#if contract.nextVestingDate}
                        <div class="flex justify-between items-center">
                            <span class="text-gray-600 dark:text-gray-300">Next Vesting</span>
                            <span class="font-medium text-gray-900 dark:text-white">{formatDate(contract.nextVestingDate)}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-gray-600 dark:text-gray-300">Next Amount</span>
                            <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.nextVestingAmount)} VOI</span>
                        </div>
                    {/if}
                    <div class="flex justify-between items-center">
                        <span class="text-gray-600 dark:text-gray-300">Remaining</span>
                        <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.remainingVestingAmount)} VOI</span>
                    </div>
                </div>
            </div>

            <!-- Consensus Section -->
            <div class="lg:block {!isExpanded ? 'hidden' : ''} bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Consensus</h4>
                    <button
                        on:click={() => handleRegisterVoteKey(contract)}
                        class="text-xs px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isWatchAccount}
                    >
                        <i class="fas fa-key"></i>
                        <span>{contract.isParticipating ? 'Update Key' : 'Register Key'}</span>
                    </button>
                </div>
                <div class="space-y-2">
                    {#if contract.isParticipating}
                        {#if contract.accountInfo?.participation}
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600 dark:text-gray-300">Key Expires</span>
                                <span class="font-medium text-gray-900 dark:text-white">
                                    {formatDate(new Date((contract.accountInfo?.participation['vote-last-valid'] - contract.accountInfo?.round) * 2.8 * 1000 + Date.now()))}
                                </span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600 dark:text-gray-300">Time Until Expiry</span>
                                <span class="font-medium text-gray-900 dark:text-white">
                                    {formatDuration((contract.accountInfo?.participation['vote-last-valid'] - contract.accountInfo?.round) * 2.8)}
                                </span>
                            </div>
                        {/if}
                        {#if contract.consensusDetails}
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600 dark:text-gray-300">Last Vote</span>
                                <span class="font-medium text-gray-900 dark:text-white">
                                    {new Date(contract.consensusDetails.last_vote_timestamp).toLocaleString()}
                                </span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600 dark:text-gray-300">Total Blocks</span>
                                <span class="font-medium text-gray-900 dark:text-white">
                                    {contract.consensusDetails.total_blocks.toLocaleString()}
                                </span>
                            </div>
                        {/if}
                    {:else}
                        <div class="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                            <i class="fas fa-info-circle mr-2"></i>
                            This contract is not currently participating in consensus. Register a participation key to begin participating.
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
</div>


