<script lang="ts">
    import NodeComponent from '../lib/component/NodeComponent.svelte';
    import ProposalsComponent from '$lib/component/ProposalsComponent.svelte';
    import RewardsComponent from '$lib/component/RewardsComponent.svelte';
    import PointsComponent from '$lib/component/PointsComponent.svelte';
    import QuestComponent from '$lib/component/QuestComponent.svelte';
    import { Spinner } from 'flowbite-svelte';

	import { onMount } from 'svelte';
    import { Card } from 'flowbite-svelte';
	import { algodClient } from '$lib/utils/algod';
    import { getNFD } from '$lib/utils/nfd'
    import { copy } from 'svelte-copy';
    import { toast } from '@zerodevx/svelte-toast';
    import { page } from '$app/stores';
    import { Badge } from 'flowbite-svelte';

    const displayBalance = (amt: number) => {
        return (amt / Math.pow(10,6)).toLocaleString();
    }

    const urlParams = $page.url.searchParams;

    export let walletId: string;
    export let isModal = true;
    let accountInfo: any;
    $: balance = 0;
    $: nfDomain = '';

    $: {
        balance = Number(accountInfo?.amount??0);
    }

    onMount(async () => {
        try {
            // Get account information
            accountInfo = await algodClient.accountInformation(walletId).do();
        } catch (error) {
            console.error('Failed to fetch account balance:', error);
        }

        const nfdData: any = await getNFD([walletId]);
        nfDomain = nfdData.find((nfd: any) => nfd.key === walletId)?.replacementValue;
    });

    const tabs: any = [
        {name: 'Node', component: NodeComponent},
        {name: 'Proposals', component: ProposalsComponent},
        //{name: 'Rewards', component: RewardsComponent},
        //{name: 'Weekly Health', component: PointsComponent},
        //{name: 'Quests', component: QuestComponent},
    ];

    $: selectedTab = (urlParams.has('tab')) ? urlParams.get('tab') : 'Node';
    $: selectedTabComponent = tabs.find((tab: { name: string; }) => tab.name === selectedTab);

</script>

<div class='max-w-3xl mx-auto mt-8'>
    {#if !accountInfo}
        <div class="flex justify-center items-center h-64">
            <Spinner size="16" />
        </div>
    {:else}
    <Card size="xl" padding="xl" class="bg-white dark:bg-gray-800 shadow-lg rounded-lg">
        <h3 class="text-2xl font-bold mb-4 flex items-center justify-between">
            <span>Account</span>
            <div>
                <button class="text-gray-500 hover:text-gray-700 mr-2" use:copy={walletId} on:click|stopPropagation on:svelte-copy={() => toast.push(`Wallet Copied to Clipboard:<br/> ${walletId.substring(0,20)}...`)} title="Copy Address">
                    <i class="fas fa-copy"></i>
                </button>
                {#if isModal}
                    <a href="/wallet/{walletId}" class="text-gray-500 hover:text-gray-700" target="_blank" title="Open Wallet View in new page">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                {/if}
            </div>
        </h3>
        <h1 class="text-xl mb-2 text-center">
            <a href='https://explorer.voi.network/explorer/account/{walletId}/transactions'
             title="Open wallet in Voi Explorer"
             target='_blank' class="text-blue-500 hover:text-blue-700 hover:underline">
             <span class="font-mono text-lg overflow-hidden whitespace-nowrap text-ellipsis max-w-full">
                {walletId.substring(0, 10)}...{walletId.substring(walletId.length - 10)}
            </span>
            </a>
        </h1>
        {#if nfDomain}
            <p class="text-center mb-4">
                <a href='https://app.nf.domains/name/{nfDomain}' target='_blank' class="text-blue-500 hover:text-blue-700 hover:underline">
                    {nfDomain}
                </a>
            </p>
        {/if}
        <div class="space-y-2">
            {#if !accountInfo}
                <p class="text-center">Loading...</p>
            {:else}
                <p class="flex justify-between">
                    <span class="font-semibold">Balance:</span>
                    <span>{displayBalance(balance)} VOI</span>
                </p>
                <p class="flex justify-between items-center">
                    <span class="font-semibold">Consensus:</span>
                    <Badge color={accountInfo.status === 'Online' ? 'green' : 'gray'}>
                        {accountInfo.status}
                    </Badge>
                </p>
            {/if}
        </div>
    </Card>
    {/if}
</div>

<div class="max-w-3xl mx-auto mt-8">
    <div class="flex border-b justify-center mb-4">
        {#each tabs as tab}
            <button class="py-2 px-4 border-b-2 font-medium text-sm focus:outline-none transition-colors duration-200
                {(selectedTab === tab.name) ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
                on:click|stopPropagation={() => selectedTab = tab.name}>
                {tab.name}
            </button>
        {/each}
    </div>

    <div class="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <svelte:component this={selectedTabComponent.component} walletId={walletId} />
    </div>
</div>
