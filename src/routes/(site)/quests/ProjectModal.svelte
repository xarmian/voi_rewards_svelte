<script lang="ts">
    import WalletSearch from "$lib/component/WalletSearch.svelte";
	import Project from "$lib/component/Project.svelte";
    import projects from "../phase2/[...slug]/projects.js";
	import { onMount } from "svelte";

    let selectedWallet: string | undefined;
    let searchWallet: string | undefined;
    export let projectId;
    $: project = projects.find((p) => p.id == projectId);

    onMount(() => {
        if (searchWallet) {
            selectedWallet = searchWallet;
        }
    });
</script>
<div class="flex flex-col mt-4 relative">
    <div class="sm:hidden h-10">&nbsp;</div>
    <p class="text-center">Enter a wallet address to see your Voi TestNet Phase #2 Quest Progress</p>
    <div class="text-center">
        <WalletSearch bind:searchText={searchWallet} storeAddress={true} onSubmit={(addr) => { selectedWallet = addr; searchWallet = addr; } } loadPreviousValue={true} />
    </div>
    {#if project}
        <div class="sm:mx-4">
            <Project {project} wallet={selectedWallet ?? null} />
        </div>
    {/if}
</div>