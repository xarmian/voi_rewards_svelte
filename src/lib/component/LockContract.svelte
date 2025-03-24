<script lang="ts">
    import type { ContractDetails } from '$lib/types';
    import { selectedWallet } from 'avm-wallet-svelte';

    export let contract: ContractDetails;
    export let onWithdrawClick: (contract: ContractDetails) => void;
    export let onRegisterVoteKeyClick: (contract: ContractDetails) => void;

    let isWatchAccount = ($selectedWallet?.app || 'Watch') === 'Watch';
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
        return `${months} ${months === 1 ? 'month' : 'months'}`;
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

<!-- Mobile View -->
<div class="lg:hidden">
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <!-- Contract Header -->
        <div class="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">Lock Contract</h3>
                    <a 
                        href={`https://explorer.voi.network/explorer/application/${contract.contractId}`} 
                        target="_blank" 
                        class="text-blue-500 hover:text-blue-600 transition-colors"
                        aria-label="View Contract on Explorer"
                    >
                        <i class="fas fa-external-link-alt text-sm"></i>
                    </a>
                </div>
                <button 
                    class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    on:click={() => isExpanded = !isExpanded}
                    aria-label={isExpanded ? "Collapse details" : "Expand details"}
                >
                    <i class={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                </button>
            </div>
        </div>

        <!-- Essential Info -->
        <div class="p-4 space-y-3">
            <div class="flex justify-between items-center">
                <span class="text-gray-600 dark:text-gray-300">Available Balance</span>
                <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.availableForWithdrawal)} VOI</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-gray-600 dark:text-gray-300">Total Balance</span>
                <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.balance)} VOI</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-gray-600 dark:text-gray-300">Status</span>
                <div class="flex gap-2">
                    <span class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        contract.isParticipating
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                    }`}>
                        <i class={`fas ${contract.isParticipating ? 'fa-check-circle' : 'fa-times-circle'} mr-1`}></i>
                        {contract.isParticipating ? 'Staking' : 'Not Staking'}
                    </span>
                    <span class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        contract.isFullyVested
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                    }`}>
                        <i class={`fas ${contract.isFullyVested ? 'fa-lock' : 'fa-clock'} mr-1`}></i>
                        {contract.isFullyVested ? 'Vested' : 'Vesting'}
                    </span>
                </div>
            </div>
            {#if contract.isParticipating && contract.accountInfo?.participation}
                <div class="flex justify-between items-center">
                    <span class="text-gray-600 dark:text-gray-300">Key Expires</span>
                    <span class="font-medium text-gray-900 dark:text-white">
                        {formatDate(new Date((contract.accountInfo?.participation['vote-last-valid'] - contract.accountInfo?.round) * 3.3 * 1000 + Date.now()))}
                    </span>
                </div>
            {/if}
            {#if contract.availableForWithdrawal > 0}
                <button
                    on:click={() => handleWithdrawClick(contract)}
                    class="w-full inline-flex justify-center items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isWatchAccount}
                >
                    <i class="fas fa-wallet mr-2"></i>
                    Withdraw Available Balance
                </button>
            {/if}
        </div>

        <!-- Expandable Content -->
        {#if isExpanded}
            <div class="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
                <!-- Vesting Details -->
                <div class="space-y-2">
                    <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Vesting Details</h4>
                    {#if contract.nextVestingDate}
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-600 dark:text-gray-300">Next Vesting</span>
                            <span class="font-medium text-gray-900 dark:text-white">{formatDate(contract.nextVestingDate)}</span>
                        </div>
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-600 dark:text-gray-300">Next Amount</span>
                            <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.nextVestingAmount)} VOI</span>
                        </div>
                    {/if}
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-600 dark:text-gray-300">Remaining to Vest</span>
                        <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.remainingVestingAmount)} VOI</span>
                    </div>
                </div>

                <!-- Consensus Details -->
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Consensus Details</h4>
                        <button
                            on:click={() => handleRegisterVoteKey(contract)}
                            class="text-xs px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isWatchAccount}
                        >
                            <i class="fas fa-key"></i>
                            <span>{contract.isParticipating ? 'Update Key' : 'Register Key'}</span>
                        </button>
                    </div>
                    {#if contract.isParticipating && contract.consensusDetails}
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-600 dark:text-gray-300">Last Vote</span>
                            <span class="font-medium text-gray-900 dark:text-white">
                                {new Date(contract.consensusDetails.last_vote_timestamp).toLocaleString()}
                            </span>
                        </div>
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-600 dark:text-gray-300">Total Blocks</span>
                            <span class="font-medium text-gray-900 dark:text-white">
                                {contract.consensusDetails.total_blocks.toLocaleString()}
                            </span>
                        </div>
                    {/if}
                </div>

                <!-- Contract Terms -->
                <div class="space-y-2">
                    <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Contract Terms</h4>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-600 dark:text-gray-300">Lockup Period</span>
                        <span class="font-medium text-gray-900 dark:text-white">{formatDuration(contract.lockupPeriod)}</span>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-600 dark:text-gray-300">Vesting Period</span>
                        <span class="font-medium text-gray-900 dark:text-white">{formatDuration(contract.vestingPeriod)}</span>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-600 dark:text-gray-300">Distribution Count</span>
                        <span class="font-medium text-gray-900 dark:text-white">{contract.distributionCount}</span>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>

<!-- Desktop View -->
<div class="hidden lg:block">
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <!-- Contract Header -->
        <div class="px-6 py-5 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        <h3 class="text-xl font-bold text-gray-900 dark:text-white">Lock Contract: </h3>
                        <a 
                            href={`https://explorer.voi.network/explorer/application/${contract.contractId}`} 
                            target="_blank" 
                            class="text-blue-500 hover:text-blue-600 transition-colors gap-3"
                            aria-label="View Contract on Explorer"
                        >
                            {contract.contractId}
                            <i class="fas fa-external-link-alt text-sm"></i>
                        </a>
                    </div>
                    <p class="text-sm text-gray-600 dark:text-gray-300">
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
                <div class="flex flex-wrap gap-2">
                    <span class={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        contract.isParticipating
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                    }`}>
                        <i class={`fas ${contract.isParticipating ? 'fa-check-circle' : 'fa-times-circle'} mr-1.5`}></i>
                        {contract.isParticipating ? 'Participating' : 'Not Participating'}
                    </span>
                    <span class={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        contract.isFullyVested
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                    }`}>
                        <i class={`fas ${contract.isFullyVested ? 'fa-lock' : 'fa-clock'} mr-1.5`}></i>
                        {contract.isFullyVested ? 'Fully Vested' : 'Vesting'}
                    </span>
                </div>
            </div>
        </div>

        <!-- Main Content -->
        <div class="p-6">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Left Column: Balance and Vesting -->
                <div class="space-y-6">
                    <!-- Balance Card -->
                    <div class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
                        <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <i class="fas fa-wallet mr-2 text-blue-500"></i>
                            Balance Information
                        </h4>
                        <div class="space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600 dark:text-gray-300">Current Balance</span>
                                <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.balance)} VOI</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600 dark:text-gray-300">Locked Balance</span>
                                <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.lockedBalance)} VOI</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600 dark:text-gray-300">Available for Withdrawal</span>
                                <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.availableForWithdrawal)} VOI</span>
                            </div>
                            {#if contract.availableForWithdrawal > 0}
                                <button
                                    on:click={() => handleWithdrawClick(contract)}
                                    class="mt-4 w-full inline-flex justify-center items-center px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={isWatchAccount}
                                >
                                    <i class="fas fa-wallet mr-2"></i>
                                    Withdraw Available Balance
                                </button>
                            {/if}
                        </div>
                    </div>

                    <!-- Vesting Card -->
                    <div class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
                        <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <i class="fas fa-calendar-alt mr-2 text-purple-500"></i>
                            Vesting Schedule
                        </h4>
                        <div class="space-y-3">
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
                                <span class="text-gray-600 dark:text-gray-300">Remaining to Vest</span>
                                <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.remainingVestingAmount)} VOI</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Right Column: Consensus and Terms -->
                <div class="space-y-6">
                    <!-- Consensus Card -->
                    <div class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center justify-between mb-4">
                            <h4 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                                <i class="fas fa-vote-yea mr-2 text-green-500"></i>
                                Consensus Participation
                            </h4>
                            <button
                                on:click={() => handleRegisterVoteKey(contract)}
                                class="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isWatchAccount}
                            >
                                <i class="fas fa-key"></i>
                                <span>{contract.isParticipating ? 'Update Key' : 'Register Key'}</span>
                            </button>
                        </div>
                        <div class="space-y-3">
                            {#if contract.isParticipating}
                                {#if contract.accountInfo?.participation}
                                    <div class="flex justify-between items-center">
                                        <span class="text-gray-600 dark:text-gray-300">Vote Key Expires</span>
                                        <span class="font-medium text-gray-900 dark:text-white">
                                            {formatDate(new Date((contract.accountInfo?.participation['vote-last-valid'] - contract.accountInfo?.round) * 3.3 * 1000 + Date.now()))}
                                        </span>
                                    </div>
                                    <div class="flex justify-between items-center">
                                        <span class="text-gray-600 dark:text-gray-300">Time Until Expiry</span>
                                        <span class="font-medium text-gray-900 dark:text-white">
                                            {formatDuration((contract.accountInfo?.participation['vote-last-valid'] - contract.accountInfo?.round) * 3.3)}
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

                    <!-- Terms Card -->
                    <div class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
                        <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <i class="fas fa-file-contract mr-2 text-orange-500"></i>
                            Contract Terms
                        </h4>
                        <div class="space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600 dark:text-gray-300">Lockup Period</span>
                                <span class="font-medium text-gray-900 dark:text-white">{formatDuration(contract.lockupPeriod)}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600 dark:text-gray-300">Vesting Period</span>
                                <span class="font-medium text-gray-900 dark:text-white">{formatDuration(contract.vestingPeriod)}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600 dark:text-gray-300">Distribution Count</span>
                                <span class="font-medium text-gray-900 dark:text-white">{contract.distributionCount}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>


