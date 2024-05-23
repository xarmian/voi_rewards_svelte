<script lang="ts">
    import Project from "$lib/component/Project.svelte";
    import projects from "../../routes/(site)/phase2/[...slug]/projects.js";

    export let walletId: string | null;
    let isDropdownOpen: boolean = false;
    export let selectedTab = 0;

    // sort projects with status='active' first then by id
    projects.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return a.id - b.id;
    });
</script>

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
                        {:else if project.realtime??false}
                            <span class="text-xs text-green-500">Realtime</span>
                        {/if}
                    </a>
                {/each}
            </div>
        </div>
    {/if}
</div>    
<div class="hidden md:flex md:flex-wrap md:justify-center md:items-center">
    <nav class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
                {:else if project.realtime??false}
                    <div class="text-xs text-green-500 dark:text-green-300">Realtime Data ⚡</div>
                {/if}
            </a>
        {/each}
    </nav>
</div>
<div class="m-0 md:mx-8 mt-4">
    <Project project={projects[selectedTab]} wallet={walletId} />
</div>

<style>
    .disabled {
        cursor: not-allowed;
        pointer-events: none;
        background-color: gray;
    }
</style>

