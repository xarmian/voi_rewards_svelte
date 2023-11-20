<script lang="ts">
    import NodeComponent from '../lib/component/NodeComponent.svelte';
    import ProposalsComponent from '$lib/component/ProposalsComponent.svelte';
    import RewardsComponent from '$lib/component/RewardsComponent.svelte';

	import { onMount } from 'svelte';
    import { Card } from 'flowbite-svelte';
	import { algodClient } from '$lib/utils/algod';
    //@ts-ignore
    import Device from 'svelte-device-info';
    import { getNFD } from '$lib/utils/nfd'
    import { copy } from 'svelte-copy';
    import { toast } from '@zerodevx/svelte-toast';
    import { page } from '$app/stores';

    const displayBalance = (amt: number) => {
        return (amt / Math.pow(10,6)).toLocaleString();
    }

    const urlParams = $page.url.searchParams;

    export let walletId: string;
    export let isModal = true;
    let accountInfo: any;
    $: balance = 0;
    $: isMobile = false;
    $: nfDomain = '';

    $: {
        balance = Number(accountInfo?.amount??0);
    }

    onMount(async () => {
        isMobile = Device.isMobile;

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
        {name: 'Rewards', component: RewardsComponent},
    ];

    $: selectedTab = (urlParams.has('tab')) ? urlParams.get('tab') : 'Node';
    $: selectedTabComponent = tabs.find((tab: { name: string; }) => tab.name === selectedTab);

</script>

<div class='cardContainer' style='margin:0;margin-top:18px;'>
    <Card padding="md" size="lg">
        <h3 class="relative flex items-center justify-center">
            <span>Account</span>
            <div class="absolute right-0">
                <button class="inline mr-1" use:copy={walletId} on:click|stopPropagation on:svelte-copy={() => toast.push(`Wallet Copied to Clipboard:<br/> ${walletId.substring(0,20)}...`)} title="Copy Address">
                    <i class="fas fa-copy"></i>
                </button>
                {#if isModal}
                    <a href="/wallet/{walletId}" target="_blank" title="Open Wallet View in new page">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                {/if}
            </div>
        </h3>
        <h1 class="font-bold">
            <a href='https://voi.observer/explorer/account/{walletId}/transactions'
             title="Open wallet in Voi.Observer"
             target='_blank' class="text-blue-500 hover:text-blue-800 hover:underline">
                {#if isMobile}
                    {walletId.substring(0, 8)}...{walletId.substring(walletId.length - 8, walletId.length)}
                {:else}
                    {walletId}
                {/if}
            </a>
        </h1>
        {#if nfDomain}
            <p class="text-center">
                <span>
                    <a href='https://app.nf.domains/name/{nfDomain}' target='_blank' class="text-blue-500 hover:text-blue-800 hover:underline">
                        {nfDomain}
                    </a>
                </span>
            </p>
        {/if}
        <br/>
        <div class="cardContents">
            {#if !accountInfo}
                <p>Loading...</p>
            {:else}
                <p>
                    <span class="label" style='width:5.2rem;'>Balance:</span>
                    <span>{displayBalance(balance)} VOI</span>
                </p>
                <p>
                    <span class="label" style='width:5.2rem;'>Consensus:</span>
                    <span class="p-1 rounded-lg border-solid text-white {accountInfo.status=='Online' ? 'bg-green-500' : 'bg-gray-300'}">{accountInfo.status}</span>
                </p>
            {/if}
        </div>
    </Card>
</div>
<br/>
<div class="flex border-b justify-center">
    {#each tabs as tab}
        <button class="py-2 px-4 border-b-2 font-medium text-sm focus:outline-none
            {(selectedTab === tab.name) ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
            on:click|stopPropagation={() => selectedTab = tab.name}>
            {tab.name}
        </button>
    {/each}
</div>

<div class="p-4">
    <svelte:component this={selectedTabComponent.component} walletId={walletId} />
</div>
<style>
    h3 {
        font-weight:bold;
        margin-bottom: 10px;
        font-size:larger;
        text-align: center;
    }
    div.cardContainer {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin: 10px;
    }
    div.cardContents {
        display:flex;
        flex-flow: column wrap;
        align-content: center;
    }
    .label {
        font-weight:bold;
        width:9rem;
        display:inline-block;
        /*text-align:right;*/
        margin-right:8px;
        box-sizing: border-box;
    }
    @media (max-width: 768px) {
        .cardContainer {
            width: 100%;
        }
    }
</style>