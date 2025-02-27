<script lang="ts">
    import { config } from '$lib/config';
    import { fade } from 'svelte/transition';
    import { algodClient } from '$lib/utils/algod';
    import { onDestroy } from 'svelte';
    import * as algosdk from 'algosdk';

    export let address: string;
    export let minimal = false;

    interface StakingContract {
        contractId: number;
        contractAddress: string;
        global_funder: string;
        global_funding: null | string;
        global_owner: string;
        global_period: number;
        global_total: string;
        global_period_seconds: number;
        global_lockup_delay: number;
        global_vesting_delay: number;
        global_period_limit: number;
        global_delegate: string;
        global_deployer: string;
        global_parent_id: number;
        global_messenger_id: number;
        global_initial: string;
        global_deadline: number;
        global_distribution_count: number;
        global_distribution_seconds: number;
    }

    let contractData: StakingContract | null = null;
    let isLoading = true;
    let error: string | null = null;
    let currentBalance = 0;
    let availableForWithdrawal = 0;
    let lockedBalance = 0;
    let nextVestingDate: Date | null = null;
    let nextVestingAmount = 0;
    let remainingVestingAmount = 0;
    let isFullyVested = false;

    let countdown: string = '';
    let countdownInterval: number;

    function formatDuration(seconds: number): string {
        // Convert to milliseconds and only show in months, rounded
        const ms = seconds * 1000;
        const months = Math.round(ms / (30.44 * 24 * 60 * 60 * 1000));
        return `${months} ${months === 1 ? 'month' : 'months'}`;
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

    function formatCountdown(targetDate: Date | null): string {
        if (!targetDate) return '';
        
        const now = new Date();
        const diff = targetDate.getTime() - now.getTime();
        
        if (diff <= 0) return 'Vesting now';
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);

        return parts.join(' ');
    }

    function startCountdown() {
        stopCountdown();
        if (nextVestingDate) {
            countdown = formatCountdown(nextVestingDate);
            countdownInterval = window.setInterval(() => {
                countdown = formatCountdown(nextVestingDate);
            }, 1000);
        }
    }

    function stopCountdown() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
    }

    function decodeState(state: any): StakingContract {
        const result: any = {
            contractAddress: address,
            contractId: 0,
        };
        
        // Helper to decode addresses
        const decodeAddress = (bytes: Uint8Array): string => {
            return algosdk.encodeAddress(bytes);
        };

        // Helper to decode numbers
        const decodeNumber = (value: any): number => {
            if (value.type === 2) { // uint
                return value.uint;
            }
            // If it's bytes, decode as uint64
            return Number(algosdk.decodeUint64(Buffer.from(value.bytes, 'base64'), 'safe'));
        };

        // Helper to decode big numbers as strings
        const decodeBigNumber = (value: any): string => {
            if (value.type === 2) { // uint
                return value.uint.toString();
            }
            // If it's bytes, decode as uint64
            return algosdk.decodeUint64(Buffer.from(value.bytes, 'base64'), 'safe').toString();
        };

        // Map of key to decode function
        const decoders: { [key: string]: (value: any) => any } = {
            'deployer': (v) => decodeAddress(Buffer.from(v.bytes, 'base64')),
            'delegate': (v) => decodeAddress(Buffer.from(v.bytes, 'base64')),
            'deadline': decodeNumber,
            'distribution_count': decodeNumber,
            'distribution_seconds': decodeNumber,
            'funder': (v) => decodeAddress(Buffer.from(v.bytes, 'base64')),
            'funding': decodeBigNumber,
            'initial': decodeBigNumber,
            'lockup_delay': decodeNumber,
            'messenger_id': decodeNumber,
            'owner': (v) => decodeAddress(Buffer.from(v.bytes, 'base64')),
            'parent_id': decodeNumber,
            'period': decodeNumber,
            'period_limit': decodeNumber,
            'period_seconds': decodeNumber,
            'total': decodeBigNumber,
            'vesting_delay': decodeNumber,
        };

        // Decode each state value
        for (const item of state) {
            const key = Buffer.from(item.key, 'base64').toString();
            
            // Get the appropriate decoder
            const decoder = decoders[key];
            if (decoder) {
                try {
                    // Add the global_ prefix to match our interface
                    result[`global_${key}`] = decoder(item.value);
                } catch (err) {
                    console.error(`Error decoding ${key}:`, err, item.value);
                }
            }
        }

        console.log('Decoded state:', result);
        return result as StakingContract;
    }

    async function loadStakingContract() {
        isLoading = true;
        error = null;
        try {
            // First get the contract ID from the API
            const curl = `${config.lockvestApiBaseUrl}?contractAddress=${address}`;
            const response = await fetch(curl, { cache: 'no-store' });
            const data = await response.json();
            
            if (!data.accounts?.[0]?.contractId) {
                throw new Error('Contract ID not found');
            }

            const contractId = data.accounts[0].contractId;

            // Get the application info using algodClient
            const appInfo = await algodClient.getApplicationByID(contractId).do();
            
            // Get current balance from the contract address
            const accountInfo = await algodClient.accountInformation(address).do();
            currentBalance = accountInfo.amount;

            // Decode the global state
            contractData = decodeState(appInfo.params['global-state']);
            
            if (contractData) {
                // Add the contract ID to the decoded data
                contractData.contractId = contractId;
                
                // Calculate periods
                const now = Math.floor(Date.now() / 1000);
                const fundingTime = contractData.global_funding ? Number(contractData.global_funding) : null;
                
                if (!fundingTime) {
                    // Contract not funded yet
                    nextVestingDate = null;
                    lockedBalance = 0;
                    isFullyVested = false;
                    nextVestingAmount = 0;
                    remainingVestingAmount = 0;
                    availableForWithdrawal = 0;
                } else {
                    // Calculate lockup components based on TEAL contract
                    const lockupDelay = Number(contractData.global_lockup_delay) * 
                                      Number(contractData.global_period) * 
                                      Number(contractData.global_period_seconds);
                    
                    // Enforce minimum vesting delay of 1 period
                    const vestingDelay = Math.max(1, Number(contractData.global_vesting_delay)) * 
                                       Number(contractData.global_period_seconds);
                    
                    // Total lockup is the lockup delay (no vesting delay added for lockup end)
                    const lockupPeriod = lockupDelay;
                    
                    // Full vesting time includes lockup and minimum vesting delay
                    const fullVestingTime = lockupPeriod + vestingDelay;
                    
                    const vestingPeriod = Number(contractData.global_distribution_count) * 
                                        Number(contractData.global_distribution_seconds);
                    
                    const totalPeriod = fullVestingTime + vestingPeriod;
                    const elapsedTime = now - fundingTime;
                    const totalBalance = Number(contractData.global_total);

                    // Calculate locked balance according to TEAL contract's MAB calculation
                    if (elapsedTime < lockupPeriod) {
                        // Still in lockup period - everything is locked
                        // First vesting happens after lockup AND minimum vesting delay
                        nextVestingDate = new Date((fundingTime + fullVestingTime) * 1000);
                        lockedBalance = totalBalance;
                        isFullyVested = false;
                        nextVestingAmount = totalBalance / Number(contractData.global_distribution_count);
                        remainingVestingAmount = totalBalance;
                    } else if (elapsedTime >= fullVestingTime) {
                        // Past both lockup and vesting delay - start regular vesting
                        // If there's no lockup period, we start counting from funding time
                        const vestingStartTime = lockupPeriod === 0 ? fundingTime : fundingTime + fullVestingTime;
                        const vestingElapsedTime = now - vestingStartTime;
                        const periodsPassed = Math.floor(vestingElapsedTime / Number(contractData.global_distribution_seconds));
                        const periodsRemaining = Number(contractData.global_distribution_count) - periodsPassed;
                        
                        if (periodsPassed >= Number(contractData.global_distribution_count)) {
                            // Fully vested
                            nextVestingDate = null;
                            lockedBalance = 0;
                            isFullyVested = true;
                            nextVestingAmount = 0;
                            remainingVestingAmount = 0;
                        } else {
                            // In vesting period
                            const nextVestingTime = vestingStartTime + ((periodsPassed + 1) * Number(contractData.global_distribution_seconds));
                            nextVestingDate = new Date(nextVestingTime * 1000);
                            
                            const amountPerPeriod = totalBalance / Number(contractData.global_distribution_count);
                            lockedBalance = amountPerPeriod * periodsRemaining;
                            remainingVestingAmount = lockedBalance;
                            nextVestingAmount = amountPerPeriod;
                            isFullyVested = false;
                        }
                    } else {
                        // In vesting delay period - everything still locked but show when first vesting will occur
                        const vestingStartTime = fundingTime + fullVestingTime;
                        nextVestingDate = new Date(vestingStartTime * 1000);
                        lockedBalance = totalBalance;
                        isFullyVested = false;
                        nextVestingAmount = totalBalance / Number(contractData.global_distribution_count);
                        remainingVestingAmount = totalBalance;
                    }

                    // Calculate available withdrawal amount considering minimum balance
                    const minimumBalance = accountInfo['min-balance'];
                    availableForWithdrawal = Math.max(0, currentBalance - lockedBalance - minimumBalance);
                }
            }
        } catch (err) {
            console.error('Error loading staking contract:', err);
            error = 'Failed to load staking contract data';
        } finally {
            isLoading = false;
        }
    }

    function formatNumber(num: number): string {
        return new Intl.NumberFormat('en-US', {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2
        }).format(num / 1_000_000); // Convert from microVOI to VOI
    }

    const LoadingOverlay = ({height = 'h-full'}: {height?: string}) => `
        <div class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-[1px] z-10 flex items-center justify-center ${height}">
            <div class="flex flex-col items-center gap-3">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 dark:border-blue-400"></div>
                <span class="text-sm text-gray-600 dark:text-gray-300">Loading...</span>
            </div>
        </div>
    `;

    onDestroy(() => {
        //stopCountdown();
    });

    $: if (address) {
        loadStakingContract();
    }

    $: if (nextVestingDate) {
        //startCountdown();
    }


</script>

{#if minimal}
    {#if isLoading}
        <div class="animate-pulse space-y-2">
            <div class="h-4 bg-gray-200 dark:bg-gray-600 rounded w-3/4"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/2"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-600 rounded w-2/3"></div>
        </div>
    {:else if error}
        <div class="text-red-500 dark:text-red-400 text-sm">
            {error}
        </div>
    {:else if contractData}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Left Column: Balances -->
            <div class="space-y-2.5">
                <!-- Status Message -->
                {#if !contractData.global_funding}
                    <div class="text-sm text-gray-600 dark:text-gray-300">Contract not funded yet</div>
                {:else if isFullyVested}
                    <div class="text-sm text-gray-600 dark:text-gray-300">Contract fully vested</div>
                {:else}
                    <div class="flex justify-between items-center">
                        <span class="text-gray-600 dark:text-gray-300">Status</span>
                        <span class="text-sm font-medium text-gray-900 dark:text-white">
                            {#if lockedBalance === Number(contractData?.global_total)}
                                In Lockup
                            {:else}
                                Vesting
                            {/if}
                        </span>
                    </div>
                {/if}

                <div class="flex flex-wrap justify-between items-center gap-x-4">
                    <span class="text-gray-600 dark:text-gray-300 min-w-[80px]">Locked Balance</span>
                    <span class="text-sm font-medium text-gray-900 dark:text-white text-right flex-1">{formatNumber(lockedBalance)} VOI</span>
                </div>
                <div class="flex flex-wrap justify-between items-center gap-x-4">
                    <span class="text-gray-600 dark:text-gray-300 min-w-[80px]">Available for Withdrawal</span>
                    <span class="text-sm font-medium text-gray-900 dark:text-white text-right flex-1">{formatNumber(availableForWithdrawal)} VOI</span>
                </div>
            </div>

            <!-- Right Column: Vesting Info -->
            {#if nextVestingDate && !isFullyVested}
                <div class="space-y-2.5 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100 dark:border-gray-700">
                    {#if lockedBalance === Number(contractData?.global_total)}
                        <!-- In Lockup Period -->
                        <div class="flex flex-wrap justify-between items-center gap-x-4">
                            <span class="text-gray-600 dark:text-gray-300 min-w-[80px]">Vesting Starts In</span>
                            <span class="text-sm font-medium text-gray-900 dark:text-white text-right flex-1">
                                {formatDuration(nextVestingDate.getTime() / 1000 - Math.floor(Date.now() / 1000))}
                            </span>
                        </div>
                        <div class="flex flex-wrap justify-between items-center gap-x-4">
                            <span class="text-gray-600 dark:text-gray-300 min-w-[80px]">Vesting Rate</span>
                            <span class="text-sm font-medium text-gray-900 dark:text-white text-right flex-1">
                                {formatNumber(Number(contractData.global_total) / Number(contractData.global_distribution_count))} VOI/mo
                            </span>
                        </div>
                        <div class="flex flex-wrap justify-between items-center gap-x-4">
                            <span class="text-gray-600 dark:text-gray-300 min-w-[80px]">Total to Distribute</span>
                            <span class="text-sm font-medium text-gray-900 dark:text-white text-right flex-1">
                                {formatNumber(Number(contractData.global_total))} VOI
                            </span>
                        </div>
                    {:else}
                        <!-- In Vesting Period -->
                        <div class="flex flex-wrap justify-between items-center gap-x-4">
                            <span class="text-gray-600 dark:text-gray-300 min-w-[80px]">Next Vest Date</span>
                            <span class="text-sm font-medium text-gray-900 dark:text-white text-right flex-1">
                                {formatDate(nextVestingDate)}
                            </span>
                        </div>
                        <div class="flex flex-wrap justify-between items-center gap-x-4">
                            <span class="text-gray-600 dark:text-gray-300 min-w-[80px]">Next Vest Amount</span>
                            <span class="text-sm font-medium text-gray-900 dark:text-white text-right flex-1">
                                {formatNumber(nextVestingAmount)} VOI
                            </span>
                        </div>
                        <div class="flex flex-wrap justify-between items-center gap-x-4">
                            <span class="text-gray-600 dark:text-gray-300 min-w-[80px]">Remaining to Vest</span>
                            <span class="text-sm font-medium text-gray-900 dark:text-white text-right flex-1">
                                {formatNumber(remainingVestingAmount)} VOI
                            </span>
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    {:else}
        <div class="text-gray-500 dark:text-gray-400 text-sm">
            No staking contract found
        </div>
    {/if}
{:else}
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 relative">
        {#if isLoading}
            <div transition:fade={{ duration: 150 }}>
                {@html LoadingOverlay({})}
            </div>
        {/if}

        <div class="flex flex-col space-y-6">
            <div class="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4">
                <div class="flex items-center space-x-4">
                    <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Staking Contract</h3>
                    <button
                        on:click={loadStakingContract}
                        class="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                        disabled={isLoading}
                    >
                        <i class="fas fa-sync-alt {isLoading ? 'animate-spin' : ''}"></i>
                        <span class="sr-only">Refresh staking data</span>
                    </button>
                </div>
            </div>

            {#if error}
                <div class="text-red-500 dark:text-red-400 text-center py-4">
                    {error}
                </div>
            {:else if contractData}
                <!-- Next Vesting Event -->
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div class="space-y-1">
                            <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">Next Vesting Event</h4>
                            {#if !contractData.global_funding}
                                <p class="text-xl font-semibold text-gray-900 dark:text-white">Contract not funded yet</p>
                            {:else if isFullyVested}
                                <p class="text-xl font-semibold text-gray-900 dark:text-white">Contract fully vested</p>
                            {:else if nextVestingDate}
                                <p class="text-xl font-semibold text-gray-900 dark:text-white">{formatDate(nextVestingDate)}</p>
                                {#if lockedBalance === Number(contractData?.global_total)}
                                    <p class="text-lg text-gray-600 dark:text-gray-300">
                                        Lockup period ends in {formatDuration(
                                            nextVestingDate.getTime() / 1000 - Math.floor(Date.now() / 1000)
                                        )}
                                    </p>
                                {:else if countdown}
                                    <div class="px-4 py-2 mt-2">
                                        <p class="font-mono text-3xl font-bold text-blue-400 tabular-nums tracking-wider">
                                            {countdown}
                                        </p>
                                    </div>
                                {/if}
                            {:else}
                                <p class="text-xl font-semibold text-gray-900 dark:text-white">No upcoming vesting events</p>
                            {/if}
                        </div>
                        {#if nextVestingAmount > 0 && lockedBalance !== Number(contractData?.global_total)}
                            <div class="flex flex-col items-start md:items-end gap-1">
                                <span class="text-sm text-gray-500 dark:text-gray-400">Next vesting amount</span>
                                <span class="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(nextVestingAmount)} VOI</span>
                            </div>
                        {/if}
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 space-x-6">
                    <!-- Balance Information -->
                    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                        <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Current Balance</h4>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(currentBalance)} VOI</p>
                    </div>

                    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                        <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Locked Balance</h4>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(lockedBalance)} VOI</p>
                    </div>

                    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                        <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Available for Withdrawal</h4>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(availableForWithdrawal)} VOI</p>
                    </div>

                    <!-- Schedule Information -->
                    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                        <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Lockup Period</h4>
                        <p class="text-lg font-medium text-gray-900 dark:text-white">
                            {formatDuration(
                                Number(contractData.global_lockup_delay) * 
                                Number(contractData.global_period) * 
                                Number(contractData.global_period_seconds)
                            )}
                        </p>
                    </div>

                    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                        <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Total Vesting Period</h4>
                        <p class="text-lg font-medium text-gray-900 dark:text-white">
                            {formatDuration(
                                Number(contractData.global_distribution_count) * 
                                Number(contractData.global_distribution_seconds)
                            )}
                        </p>
                    </div>

                    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                        <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Amount Per Vesting Period</h4>
                        <p class="text-lg font-medium text-gray-900 dark:text-white">
                            {formatNumber(Number(contractData.global_total) / Number(contractData.global_distribution_count))} VOI
                        </p>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {Number(contractData.global_distribution_count)} distribution{Number(contractData.global_distribution_count) === 1 ? '' : 's'}
                        </p>
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}
