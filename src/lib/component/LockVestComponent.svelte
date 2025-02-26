<script lang="ts">
    import { algodClient } from '$lib/utils/algod';
    import * as algosdk from 'algosdk';

    export let childAccounts: {
        contractId: number;
        address: string;
        isParticipating: boolean;
        balance: number;
    }[];

    interface ContractDetails {
        contractId: number;
        contractAddress: string;
        owner: string;
        balance: number;
        isParticipating: boolean;
        lockupPeriod: number;
        vestingPeriod: number;
        totalAmount: string;
        fundingTime: number | null;
        nextVestingDate: Date | null;
        lockedBalance: number;
        availableForWithdrawal: number;
        isFullyVested: boolean;
        nextVestingAmount: number;
        remainingVestingAmount: number;
        distributionCount: number;
        distributionSeconds: number;
        lockupDelay: number;
        vestingDelay: number;
        periodSeconds: number;
        period: number;
        global_funding?: string;
        global_lockup_delay?: number;
        global_period?: number;
        global_period_seconds?: number;
        global_vesting_delay?: number;
        global_total?: string;
        global_distribution_count?: number;
        global_distribution_seconds?: number;
        global_owner?: string;
    }

    let contracts: ContractDetails[] = [];
    let isLoading = true;
    let error: string | null = null;

    function decodeState(state: any, address: string): ContractDetails {
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

        return result;
    }

    async function loadContractDetails() {
        isLoading = true;
        error = null;
        
        try {
            // Create a new array to hold all contract promises
            const contractPromises = childAccounts.map(async (account) => {
                try {
                    // Get the application info using algodClient
                    const appInfo = await algodClient.getApplicationByID(account.contractId).do();
                    const accountInfo = await algodClient.accountInformation(account.address).do();
                    const currentBalance = accountInfo.amount;
                    
                    // Decode the global state
                    const decodedState = decodeState(appInfo.params['global-state'], account.address);
                    
                    // Calculate periods and balances
                    const now = Math.floor(Date.now() / 1000);
                    const fundingTime = decodedState.global_funding ? Number(decodedState.global_funding) : null;
                    
                    let nextVestingDate = null;
                    let lockedBalance = 0;
                    let isFullyVested = false;
                    let nextVestingAmount = 0;
                    let remainingVestingAmount = 0;
                    let availableForWithdrawal = 0;

                    if (fundingTime) {
                        // Calculate lockup components
                        const lockupDelay = Number(decodedState.global_lockup_delay ?? 0) * 
                                          Number(decodedState.global_period ?? 0) * 
                                          Number(decodedState.global_period_seconds ?? 0);
                        
                        const vestingDelay = Math.max(1, Number(decodedState.global_vesting_delay ?? 0)) * 
                                           Number(decodedState.global_period_seconds ?? 0);
                        
                        const lockupPeriod = lockupDelay;
                        const fullVestingTime = lockupPeriod + vestingDelay;
                        const vestingPeriod = Number(decodedState.global_distribution_count ?? 0) * 
                                            Number(decodedState.global_distribution_seconds ?? 0);
                        
                        const totalPeriod = fullVestingTime + vestingPeriod;
                        const elapsedTime = now - fundingTime;
                        const totalBalance = Number(decodedState.global_total ?? '0');

                        if (elapsedTime < lockupPeriod) {
                            nextVestingDate = new Date((fundingTime + fullVestingTime) * 1000);
                            lockedBalance = totalBalance;
                            isFullyVested = false;
                            nextVestingAmount = totalBalance / Number(decodedState.global_distribution_count ?? 1);
                            remainingVestingAmount = totalBalance;
                        } else if (elapsedTime >= fullVestingTime) {
                            const vestingElapsedTime = elapsedTime - fullVestingTime;
                            const periodsPassed = Math.floor(vestingElapsedTime / Number(decodedState.global_distribution_seconds ?? 1));
                            const periodsRemaining = Number(decodedState.global_distribution_count ?? 0) - periodsPassed;
                            
                            if (periodsPassed >= Number(decodedState.global_distribution_count ?? 0)) {
                                nextVestingDate = null;
                                lockedBalance = 0;
                                isFullyVested = true;
                                nextVestingAmount = 0;
                                remainingVestingAmount = 0;
                            } else {
                                const vestingStartTime = fundingTime + fullVestingTime;
                                const nextVestingTime = vestingStartTime + ((periodsPassed + 1) * Number(decodedState.global_distribution_seconds ?? 0));
                                nextVestingDate = new Date(nextVestingTime * 1000);
                                
                                const amountPerPeriod = totalBalance / Number(decodedState.global_distribution_count ?? 1);
                                lockedBalance = amountPerPeriod * periodsRemaining;
                                remainingVestingAmount = lockedBalance;
                                nextVestingAmount = amountPerPeriod;
                                isFullyVested = false;
                            }
                        } else {
                            const vestingStartTime = fundingTime + fullVestingTime;
                            nextVestingDate = new Date(vestingStartTime * 1000);
                            lockedBalance = totalBalance;
                            isFullyVested = false;
                            nextVestingAmount = totalBalance / Number(decodedState.global_distribution_count ?? 1);
                            remainingVestingAmount = totalBalance;
                        }

                        availableForWithdrawal = Math.max(0, currentBalance - lockedBalance);
                    }

                    return {
                        contractId: account.contractId,
                        contractAddress: account.address,
                        owner: decodedState.global_owner ?? '',
                        balance: currentBalance,
                        isParticipating: accountInfo.status === 'Online',
                        lockupPeriod: Number(decodedState.global_lockup_delay ?? 0) * Number(decodedState.global_period ?? 0) * Number(decodedState.global_period_seconds ?? 0),
                        vestingPeriod: Number(decodedState.global_distribution_count ?? 0) * Number(decodedState.global_distribution_seconds ?? 0),
                        totalAmount: decodedState.global_total ?? '0',
                        fundingTime,
                        nextVestingDate,
                        lockedBalance,
                        availableForWithdrawal,
                        isFullyVested,
                        nextVestingAmount,
                        remainingVestingAmount,
                        distributionCount: Number(decodedState.global_distribution_count ?? 0),
                        distributionSeconds: Number(decodedState.global_distribution_seconds ?? 0),
                        lockupDelay: Number(decodedState.global_lockup_delay ?? 0),
                        vestingDelay: Number(decodedState.global_vesting_delay ?? 0),
                        periodSeconds: Number(decodedState.global_period_seconds ?? 0),
                        period: Number(decodedState.global_period ?? 0)
                    };
                } catch (err) {
                    console.error('Error loading contract:', err);
                    return null;
                }
            });

            // Wait for all promises to resolve and filter out any null results
            const results = await Promise.all(contractPromises);
            contracts = results.filter((contract): contract is ContractDetails => contract !== null);
            
        } catch (err) {
            console.error('Error loading contracts:', err);
            error = 'Failed to load contract data';
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

    $: {
        if (childAccounts && childAccounts.length > 0) {
            loadContractDetails();
        } else {
            isLoading = false;
            contracts = [];
        }
    }
</script>

<div class="space-y-8">
    <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Lock+Vest Contracts</h2>
        <button
            on:click={loadContractDetails}
            class="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            disabled={isLoading}
        >
            <i class="fas fa-sync-alt {isLoading ? 'animate-spin' : ''}"></i>
            <span class="sr-only">Refresh contract data</span>
        </button>
    </div>

    {#if isLoading}
        <div class="flex justify-center items-center h-64">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
    {:else if error}
        <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p class="text-red-600 dark:text-red-400">{error}</p>
        </div>
    {:else if contracts.length === 0}
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
            <p class="text-gray-600 dark:text-gray-400">No Lock+Vest contracts found for this wallet</p>
        </div>
    {:else}
        <!-- Summary Stats -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Contracts</h3>
                <p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{contracts.length}</p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Locked Balance</h3>
                <p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                    {formatNumber(contracts.reduce((sum, c) => sum + c.lockedBalance, 0))} VOI
                </p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Available for Withdrawal</h3>
                <p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                    {formatNumber(contracts.reduce((sum, c) => sum + c.availableForWithdrawal, 0))} VOI
                </p>
            </div>
        </div>

        <!-- Contract List -->
        <div class="space-y-6">
            {#each contracts as contract}
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                    <!-- Contract Header -->
                    <div class="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                        <div class="flex items-center justify-between">
                            <div>
                                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                                    Contract <a href={`https://explorer.voi.network/explorer/application/${contract.contractId}`} target="_blank" class="text-blue-500 hover:text-blue-600">
                                        {contract.contractId}
                                    </a>
                                </h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                    <a href={`https://explorer.voi.network/explorer/account/${contract.contractAddress}`} target="_blank" class="text-blue-500 hover:text-blue-600">
                                        {truncateAddress(contract.contractAddress)}
                                    </a>
                                </p>
                            </div>
                            <div class="flex items-center space-x-2">
                                <span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    contract.isParticipating
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                        : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                                }`}>
                                    {contract.isParticipating ? 'Online' : 'Offline'}
                                </span>
                                <span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    contract.isFullyVested
                                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
                                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                                }`}>
                                    {contract.isFullyVested ? 'Fully Vested' : 'Vesting'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Contract Details -->
                    <div class="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <!-- Balance Information -->
                        <div class="space-y-4">
                            <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">Balance Information</h4>
                            <div class="space-y-2">
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-300">Current Balance</span>
                                    <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.balance)} VOI</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-300">Locked Balance</span>
                                    <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.lockedBalance)} VOI</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-300">Available for Withdrawal</span>
                                    <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.availableForWithdrawal)} VOI</span>
                                </div>
                            </div>
                        </div>

                        <!-- Vesting Schedule -->
                        <div class="space-y-4">
                            <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">Vesting Schedule</h4>
                            <div class="space-y-2">
                                {#if contract.nextVestingDate}
                                    <div class="flex justify-between">
                                        <span class="text-gray-600 dark:text-gray-300">Next Vesting</span>
                                        <span class="font-medium text-gray-900 dark:text-white">{formatDate(contract.nextVestingDate)}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-600 dark:text-gray-300">Next Amount</span>
                                        <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.nextVestingAmount)} VOI</span>
                                    </div>
                                {/if}
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-300">Remaining to Vest</span>
                                    <span class="font-medium text-gray-900 dark:text-white">{formatNumber(contract.remainingVestingAmount)} VOI</span>
                                </div>
                            </div>
                        </div>

                        <!-- Contract Terms -->
                        <div class="space-y-4">
                            <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">Contract Terms</h4>
                            <div class="space-y-2">
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-300">Lockup Period</span>
                                    <span class="font-medium text-gray-900 dark:text-white">{formatDuration(contract.lockupPeriod)}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-300">Vesting Period</span>
                                    <span class="font-medium text-gray-900 dark:text-white">{formatDuration(contract.vestingPeriod)}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-300">Distribution Count</span>
                                    <span class="font-medium text-gray-900 dark:text-white">{contract.distributionCount}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>