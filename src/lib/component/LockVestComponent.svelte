<script lang="ts">
    import { onMount } from 'svelte';
    import { Spinner } from 'flowbite-svelte';
    import { config } from '../config';
    import type { LockContract } from '../data/types';

    interface ExtendedLockContract extends LockContract {
        lockupDuration: string;
        vestingStartDate: Date;
        unlockDate: Date;
        vestingEndDate: Date;
    }

    export let walletId: string;
    let apiData: any = null;
    let contracts: ExtendedLockContract[] = [];
    let totalLockedAmount = 0;
    let totalFundedAmount = 0;
    let contractCount = 0;

    const fetchLockVestData = async () => {
        try {
            if (walletId && walletId.length > 0) {
                const url = `${config.lockvestApiBaseUrl}?owner=${walletId}`;
                const response = await fetch(url, { cache: 'no-store' });
                apiData = await response.json();
                processData();
            }
        } catch (error) {
            console.error('Failed to fetch Lock+Vest data:', error);
        }
    };

    const processData = () => {
        if (!apiData || !apiData.accounts) return;

        contracts = apiData.accounts.map((contract: LockContract) => {
            // Calculate the total lock duration in seconds
            const totalLockSeconds = contract.global_period * contract.global_period_seconds * contract.global_lockup_delay;

            // Calculate the vesting start date (when tokens start to unlock)
            const vestingStartDate = new Date(contract.global_deadline*1000 + totalLockSeconds * 1000 + contract.global_distribution_seconds * 1000);
            console.log(totalLockSeconds, contract.global_distribution_seconds);
            // Calculate the full unlock date
            const unlockDate = vestingStartDate;

            // Calculate the lockup duration (time until vesting starts)
            const lockupSeconds = contract.global_lockup_delay * contract.global_period_seconds * contract.global_period;
            const lockupDuration = formatDuration(lockupSeconds);

            // Calculate the vesting duration
            const vestingSeconds = totalLockSeconds - lockupSeconds;
            const vestingDuration = formatDuration(vestingSeconds);

            return {
                ...contract,
                lockupDuration,
                vestingDuration,
                vestingStartDate,
                unlockDate
            };
        });

        // Sort contracts by unlock date (soonest first)
        contracts.sort((a, b) => a.unlockDate.getTime() - b.unlockDate.getTime());

        contractCount = contracts.length;
        totalLockedAmount = contracts.reduce((sum, contract) => sum + (parseFloat(contract.global_initial) / 1e6), 0);
    };

    const truncateAddress = (address: string, chars = 6) => {
        return `${address.slice(0, chars)}...${address.slice(-chars)}`;
    };

    function formatDuration(seconds: number): string {
        const totalDays = Math.floor(seconds / (24 * 60 * 60));
        const years = Math.floor(totalDays / 365);
        const months = Math.floor((totalDays % 365) / 30);
        const days = totalDays % 30;

        let parts = [];
        if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`);
        if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
        if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);

        return parts.join(', ');
    }

    // Add a new function to format the remaining time
    function formatRemainingTime(unlockDate: Date): string {
        const now = new Date();
        const diffInSeconds = Math.floor((unlockDate.getTime() - now.getTime()) / 1000);
        return formatDuration(diffInSeconds);
    }

    onMount(fetchLockVestData);
</script>

<div class="p-6 bg-white dark:bg-gray-900 rounded-lg shadow-md">
    <h3 class="text-xl font-bold mb-6 text-gray-800 dark:text-gray-200">Lock+Vest Summary</h3>
    {#if apiData === null}
        <div class="flex justify-center items-center h-64">
            <Spinner size="16" />
        </div>
    {:else if contractCount === 0}
        <div class="text-center text-gray-500 dark:text-gray-400 py-8">
            No Lock+Vest contracts found for this wallet
        </div>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
                <h4 class="text-lg font-semibold text-gray-700 dark:text-gray-300">Total Locked</h4>
                <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalLockedAmount.toFixed(2)} VOI</p>
            </div>
            <div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
                <h4 class="text-lg font-semibold text-gray-700 dark:text-gray-300">Number of Contracts</h4>
                <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">{contractCount}</p>
            </div>
        </div>
        <div class="space-y-4">
            <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-200">Contract Details (Sorted by Soonest to Unlock)</h4>
            {#each contracts as contract}
                <div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
                    <p class="mb-2">
                        <span class="font-semibold text-gray-700 dark:text-gray-300">Contract Address:</span>
                        <span class="text-gray-600 dark:text-gray-400"><a href="https://explorer.voi.network/explorer/account/{contract.contractAddress}/transactions" target="_blank" class="text-blue-500 hover:text-blue-700 hover:underline">{truncateAddress(contract.contractAddress)}</a></span>
                    </p>
                    <p class="mb-2">
                        <span class="font-semibold text-gray-700 dark:text-gray-300">Contract ID:</span>
                        <span class="text-gray-600 dark:text-gray-400"><a href="https://explorer.voi.network/explorer/application/{contract.contractId}" target="_blank" class="text-blue-500 hover:text-blue-700 hover:underline">{contract.contractId}</a></span>
                    </p>
                    <p class="mb-2">
                        <span class="font-semibold text-gray-700 dark:text-gray-300">Initial Amount:</span>
                        <span class="text-gray-600 dark:text-gray-400">
                            {parseInt(contract.global_initial) > 0 ? (parseFloat(contract.global_initial) / 1e6).toFixed(2) + ' VOI': 'Unknown'}
                        </span>
                    </p>
                    {#if false}
                        {#if new Date(contract.global_deadline * 1000) > new Date()}
                            <p class="mb-2">
                                <span class="font-semibold text-gray-700 dark:text-gray-300">Lock Deadline:</span>
                                <span class="text-gray-600 dark:text-gray-400">{new Date(contract.global_deadline * 1000).toLocaleDateString()}</span>
                            </p>
                        {/if}
                        <p class="mb-2 flex space-x-2">
                            <span class="font-semibold text-gray-700 dark:text-gray-300">Vesting Begins:</span>
                            <span class="text-gray-600 dark:text-gray-400">{contract.vestingStartDate.toLocaleString()}</span>
                            <span class="text-gray-600 dark:text-gray-400">({formatRemainingTime(contract.vestingStartDate)} remaining)</span>
                        </p>
                        <p class="mb-2">
                            <span class="font-semibold text-gray-700 dark:text-gray-300">Vesting Duration:</span>
                            <span class="text-gray-600 dark:text-gray-400">{contract.global_vesting_delay} seconds</span>
                        </p>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>