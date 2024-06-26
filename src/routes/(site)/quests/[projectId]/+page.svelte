<script lang="ts">
    import WalletSearch from "$lib/component/WalletSearch.svelte";
	import { goto } from "$app/navigation";
    import type { PageData } from './$types';
	import Project from "$lib/component/Project.svelte";
    import projects from "../../phase2/[...slug]/projects.js";
	import { onMount } from "svelte";

    export let data: PageData;
    let selectedWallet: string | undefined;
    let searchWallet: string | undefined;
    $: projectId = Number(data.props.projectId);
    $: project = projects.find((project) => project.id == projectId);

    onMount(() => {
        if (searchWallet) {
            selectedWallet = searchWallet;
        }
    });
</script>
<div class="flex flex-col mt-4 relative">
    <div class="absolute top-1 sm:top-4 left-4">
        <a href="/quests" class="text-blue-500 hover:text-blue-700"><i class="fas fa-arrow-left"></i> Back to Quests</a>
    </div>
    <div class="sm:hidden h-10">&nbsp;</div>
    <p class="text-center">Enter a wallet address to see your Voi TestNet Phase #2 Quest Progress</p>
    <div class="text-center">
        <WalletSearch bind:searchText={searchWallet} storeAddress={true} onSubmit={(addr) => { selectedWallet = addr; searchWallet = addr; } } loadPreviousValue={true} />
    </div>
    {#if project}
        <div class="sm:mx-4">
            <Project {project} bind:searchWallet={searchWallet} wallet={selectedWallet ?? null} />
        </div>
    {/if}
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
</div>