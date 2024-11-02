<script lang="ts">
    import { LinkSolid, StarSolid, StarOutline, CopySolid } from 'flowbite-svelte-icons';
    import { favorites } from '../../../stores/favorites';
    import { copy } from 'svelte-copy';
    import { toast } from '@zerodevx/svelte-toast';
    import { selectedWallet } from 'avm-wallet-svelte';

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

    function setAccount(address: string) {
        selectedWallet.set({
            address: address,
            app: ''
        });
    }
</script>

<div class="bg-white dark:bg-gray-900 rounded-lg shadow-md p-4 space-y-4">
    <div class="flex justify-between items-center">
        <div>
            <p class="text-xs text-gray-600 flex items-center gap-2">
                Address: 
                {#if addressLink}
                    <a class="text-blue-500 hover:underline cursor-pointer" on:click={() => setAccount(`${account.address}`)}>{account.address}</a>
                {:else}
                    {account.address}
                {/if}
                
                <button 
                    use:copy={account.address}
                    on:click|stopPropagation 
                    on:svelte-copy={() => toast.push(`Address copied to clipboard`)}
                    class="text-gray-600 hover:text-gray-800"
                    title="Copy Address"
                >
                    <CopySolid size="sm" />
                </button>

                <a 
                    href={`https://explorer.voi.network/explorer/account/${account.address}`}
                    target="_blank"
                    class="text-gray-600 hover:text-gray-800"
                    title="View on Explorer"
                >
                    <LinkSolid size="sm" />
                </a>
                
                <button 
                    on:click={() => favorites.toggle(account.address)}
                    class="hover:scale-110 transition-transform"
                    title={$favorites.includes(account.address) ? "Remove from favorites" : "Add to favorites"}
                >
                    {#if $favorites.includes(account.address)}
                        <StarSolid class="w-4 h-4 text-yellow-300" />
                    {:else}
                        <StarOutline class="w-4 h-4" />
                    {/if}
                </button>
            </p>
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
