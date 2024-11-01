<script lang="ts">
    export let addressLink: boolean = false;

    export let account: {
        address: string;
        isParticipating: boolean;
        balance: number;
        blocksProduced24h: number;
        expectedBlocksPerDay: number;
        expectedBlocksPerWeek: number;
        expectedBlocksPerMonth: number;
    };

    const blockPeriods = [
        { period: 'Day', amount: account.expectedBlocksPerDay },
        { period: 'Week', amount: account.expectedBlocksPerWeek },
        { period: 'Month', amount: account.expectedBlocksPerMonth }
    ];
</script>

<div class="bg-white dark:bg-gray-900 rounded-lg shadow-md p-4 space-y-4">
    <div class="flex justify-between items-center">
        <div>
            <p class="text-xs text-gray-600">Address: {#if addressLink}<a class="text-blue-500 hover:underline" href={`/wallet/${account.address}`}>{account.address}</a>{:else}{account.address}{/if}</p>
            <p class="text-sm">
                Status: 
                <span class={`font-semibold rounded-md px-2 ${account.isParticipating ? "text-green-600 dark:text-green-400 bg-green-200 dark:bg-green-900" : "text-red-600 dark:text-red-400 bg-red-200 dark:bg-red-900"}`}>
                    {account.isParticipating ? 'Online' : 'Offline'}
                </span>
            </p>
        </div>
        <div class="text-right">
            <p class="text-xs text-gray-600">Balance</p>
            <p class="text-xl font-bold">{account.balance?.toLocaleString()} VOI</p>
        </div>
    </div>

    <div>
        <h2 class="text-lg font-semibold mb-2">
            <div class="flex items-center">
                Estimated Blocks
                {#if !account.isParticipating}
                    (if participating)
                {/if}
            </div>
        </h2>
        <div class="grid grid-cols-3 gap-2">
            {#each blockPeriods as { period, amount }}
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
                    <p class="text-xs text-gray-600 dark:text-gray-400">Per {period}</p>
                    <p class="text-sm font-bold">{amount?.toLocaleString()} blocks</p>
                </div>
            {/each}
        </div>
    </div>
</div>
