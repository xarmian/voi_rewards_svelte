<script lang="ts">
    import WalletSearch from "$lib/component/WalletSearch.svelte";
	import Project from "$lib/component/Project.svelte";
    import projects from "../phase2/[...slug]/projects.js";
	import { onMount } from "svelte";

    let selectedWallet: string | undefined;
    export let searchWallet: string | undefined = selectedWallet;
    export let projectId;
    $: project = projects.find((p) => p.id == projectId);

    onMount(() => {
        if (searchWallet) {
            selectedWallet = searchWallet;
        }
    });
</script>
<div class="min-h-full sm:border-l-4 sm:border-l-teal-400">
    <div class="n27 flex flex-col pt-4 relative">
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
    <div class="n27 pb-8 text-center">
        <p class="text-gray-500">Reached the end? Check out the <a href="/phase2" class="text-blue-500 hover:text-blue-700">full list of projects</a> to find more quests, and check back regularly for new quests and updates.</p>
    </div>
</div>