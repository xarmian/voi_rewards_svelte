<script lang="ts">
    import WalletSearch from "$lib/component/WalletSearch.svelte";
	import { goto } from "$app/navigation";
    import type { PageData } from './$types';
	import QuestComponent from "$lib/component/QuestComponent.svelte";
	import { onMount } from "svelte";

    export let data: PageData;
    $: selectedWallet = data.props.wallet as string | null;
    let searchText: string | undefined;
    let projectId = data.props.projectId;

    onMount(() => {
        if (selectedWallet) {
            searchText = selectedWallet;
        }
        else if (searchText) {
            selectedWallet = searchText;
        }
    });
</script>
<div class="flex flex-col dark:bg-purple-950">
    <div class="flex flex-col {projectId ? 'blur-sm' : ''}">
        <div class="flex flex-col mt-4">
            <h1 class="text-4xl font-bold tracking-tight text-gray-900 dark:text-white place-self-center">
                Phase 2 Quest Tracking
            </h1>
            <br/>
            <div class="bg-slate-200 dark:bg-slate-700 border-l-4 border-yellow-500 text-yellow-800 dark:text-gray-200 p-4 mb-4 w-3/4 place-self-center" role="alert">
                <p>This is an unofficial resource and is not affiliated with Voi Network or the Voi Foundation.
                    This page is intended to help the community track their TestNet Phase 2 Quest progress.
                </p>
                <br/>
                <p>As always please visit the <a href="https://discord.gg/voi-network" target="_blank" class="underline text-yellow-700 dark:text-yellow-300">Voi Discord</a>
                    for more specific help, and find the <a href="https://medium.com/@voifoundation/phase-2-of-the-incentivised-testnet-bf32d880e8f4" target="_blank" class="underline text-yellow-700 dark:text-yellow-300">Official Phase 2 announcement here</a>.
                </p>
            </div>
        </div> 
        <br/>
        <p class="text-center">Enter a wallet address to see your Voi TestNet Phase #2 Quest Progress</p>
        <div class="text-center">
            <WalletSearch onSubmit={(addr) => goto(`/phase2/${addr}`)} loadPreviousValue={true} clearOnSubmit={true} storeAddress={true} bind:searchText={searchText} />
        </div>
        {#if selectedWallet}
            <br/>
            <div class='flex flex-col flex-wrap justify-center place-items-center p-4 rounded-xl bg-gray-300 dark:bg-gray-600 self-center relative'>
                <div class="text-lg">Selected Wallet:</div>
                <div class="hidden md:block">{selectedWallet}</div>
                <div class="block md:hidden">{selectedWallet.substring(0,8)}...{selectedWallet.substring(selectedWallet.length-8,selectedWallet.length)}</div>
                <button class="absolute text-sm h-9 w-9 top-2 right-2 p-2 text-gray-200 bg-gray-500 rounded-full" on:click={() => goto('/phase2')}>
                    X
                </button>
            </div>
        {/if}
        <br/>
        <div class="flex justify-center space-x-4">
            <div class="self-center">Need Testnet VOI?</div>
            <a href="https://voiager.org/get-started" target="_blank" class="flex flex-col items-center py-2 px-4 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700">
                <i class="fas fa-faucet text-3xl"></i>
                <div>$VOI Faucet</div>
            </a>
            <a href="https://faucet.nautilus.sh{selectedWallet ? '?account='+selectedWallet : ''}" target="_blank" class="flex flex-col items-center py-2 px-4 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-700">
                <i class="fas fa-faucet text-3xl"></i>
                <div>$VIA Faucet</div>
            </a>
        </div>
        <br/>
    </div>
    <QuestComponent walletId={selectedWallet} bind:selectedTab={projectId} />
</div>