<script lang="ts">
    import InfoButton from '../../../lib/component/ui/InfoButton.svelte';
    import WalletSearch from "$lib/component/WalletSearch.svelte";
    import Project from "$lib/component/Project.svelte";
    import projects from "./projects.js";
    import { Card, Popover, Tabs, TabItem } from "flowbite-svelte";
	import { onMount } from 'svelte';

    let selectedWallet: string | null = null;
    let isDropdownOpen = false;
    $: selectedTab = 0;

    // sort projects with status='active' first then by id
    projects.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return a.id - b.id;
    });
    
</script>
<div class="flex flex-col">
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
            <p>As always please visit the <a href="https://discord.gg/vnFbrJrHeW" target="_blank" class="underline text-yellow-700 dark:text-yellow-300">Voi Discord</a>
                for more specific help, and find the <a href="https://medium.com/@voifoundation/phase-2-of-the-incentivised-testnet-bf32d880e8f4" target="_blank" class="underline text-yellow-700 dark:text-yellow-300">Official Phase 2 announcement here</a>.
            </p>
        </div>
    </div> 
    <br/>
    <p class="text-center">Enter a wallet address to see your Voi TestNet Phase #2 Quest Progress</p>
    <div class="text-center">
        <WalletSearch onSubmit={(addr) => selectedWallet = addr} loadPreviousValue={false} />
    </div>
    {#if selectedWallet}
        <br/>
        <div class='flex flex-col flex-wrap justify-center place-items-center p-4 rounded-xl bg-gray-300 dark:bg-gray-600 self-center relative'>
            <div class="text-lg">Selected Wallet:</div>
            <div class="hidden md:block">{selectedWallet}</div>
            <div class="block md:hidden">{selectedWallet.substring(0,8)}...{selectedWallet.substring(selectedWallet.length-8,selectedWallet.length)}</div>
            <button class="absolute text-sm h-9 w-9 top-2 right-2 p-2 text-gray-200 bg-gray-500 rounded-full" on:click={() => selectedWallet = null}>
                X
            </button>
        </div>
    {/if}
    <br/>

    <div class="md:hidden place-self-center flex flex-row">
        <div class="self-center mr-2">
            Project:
        </div>
        <button class="bg-blue-500 text-white rounded-lg px-4 py-2 flex justify-between items-center" on:click={() => isDropdownOpen = !isDropdownOpen}>
            <span>{projects[selectedTab].title}</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
        </button>
        {#if isDropdownOpen}
            <div class="relative">
                <div class="absolute z-10 mt-2 w-64 bg-white rounded-lg shadow-lg">
                    {#each projects as project, i}
                        <a 
                            class="block px-4 py-2 text-gray-800 hover:bg-blue-500 hover:text-white" 
                            class:disabled={(project.status??'inactive') !== 'active'}
                            on:click={() => { selectedTab = i; isDropdownOpen = false; }}>
                            {project.title}
                            {#if (project.status??'inactive') !== 'active'}
                                <span class="text-xs text-red-500">Coming soon!</span>
                            {/if}
                        </a>
                    {/each}
                </div>
            </div>
        {/if}
    </div>    
    <div class="hidden md:flex md:flex-wrap md:justify-center md:items-center">
        <nav class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {#each projects as project, i}
                <a 
                    class="m-1 cursor-pointer border-transparent rounded-xl w-full flex flex-col justify-center 
                    whitespace-nowrap py-6 px-3 border-b-4 font-semibold text-lg 
                    hover:text-gray-700 dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-300 
                    bg-blue-200 dark:bg-blue-900 hover:bg-blue-300 dark:hover:bg-blue-700
                    {selectedTab === i ? 'text-white !bg-blue-500 dark:!bg-blue-500' : 'text-gray-500 dark:text-gray-200'}" 
                    class:disabled={(project.status??'inactive') !== 'active'}
                    on:click={() => selectedTab = i}>
                    <div>{project.title}</div>
                    {#if (project.status??'inactive') !== 'active'}
                        <div class="text-xs text-red-500 dark:text-red-300">Coming soon!</div>
                    {/if}
                </a>
            {/each}
        </nav>
    </div>
    <div class="m-0 md:mx-8 mt-4">
        <Project project={projects[selectedTab]} wallet={selectedWallet} />
    </div>
</div>
<style>
    .disabled {
        cursor: not-allowed;
        pointer-events: none;
        background-color: gray;
    }
</style>