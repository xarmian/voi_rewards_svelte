<script lang="ts">
    import WalletSearch from "$lib/component/WalletSearch.svelte";
	import Project from "$lib/component/Project.svelte";
	import { onDestroy, onMount } from "svelte";
    import { browser } from '$app/environment';
	import type { IProject } from "$lib/data/types.js";

    let selectedWallet: string | undefined;
    export let searchWallet: string | undefined = selectedWallet;
    export let projectId;
    export let projects: IProject[] = [];

    $: project = projects.find((p) => p.id == projectId);

    onMount(async () => {
        if (searchWallet) {
            selectedWallet = searchWallet;
        }
    });

    onDestroy(() => {
        if (browser && document) {
            document.body.style.overflow = 'auto';
        }
    });

</script>
<div class="min-h-full">
    <div class="n27 flex flex-col pt-4 relative">
        {#if project}
            <div class="sm:mx-4">
                <Project project={project} bind:searchWallet={searchWallet} wallet={selectedWallet ?? null} />
            </div>
        {/if}
    </div>
    <div class="n27 pb-8 text-center">
        <p class="text-gray-500">Reached the end? Check out the <a href="/phase2" class="text-blue-500 hover:text-blue-700">full list of projects</a> to find more quests, and check back regularly for new quests and updates.</p>
    </div>
</div>