<script lang="ts">
    import Project from "$lib/component/Project.svelte";
    import type { IProject } from "$lib/data/types.js";
    import projects from "../../routes/(site)/phase2/[...slug]/projects.js";

    export let walletId: string | null;
    let isDropdownOpen: boolean = false;
    export let selectedTab = 0;

    // sort projects with status='active' and realtime=true first, then by id
    projects.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        if (a.realtime && !b.realtime) return -1;
        if (!a.realtime && b.realtime) return 1;
        return a.id - b.id;
    });

    let groupedProjects: { [key: string]: IProject[] } = {};

    projects.forEach(project => {
        if (!groupedProjects[project.category]) {
            groupedProjects[project.category] = [];
        }
        groupedProjects[project.category].push(project);
    });

    let sortOrder = ["Core", "Wallets", "DEXes", "NFTs", "Tools", "Other"];

    let sortedKeys = Object.keys(groupedProjects).sort((a, b) => {
        let indexA = sortOrder.indexOf(a);
        let indexB = sortOrder.indexOf(b);

        if (indexA === -1) indexA = sortOrder.length - 1;
        if (indexB === -1) indexB = sortOrder.length - 1;

        return indexA - indexB;
    });

    let sortedGroupedProjects: { [key: string]: IProject[] } = {};

    sortedKeys.forEach(key => {
        sortedGroupedProjects[key] = groupedProjects[key];
    });

    groupedProjects = sortedGroupedProjects;

    $: selectedProject = projects.find((project) => project.id == selectedTab);
</script>
<div class="md:hidden place-self-center flex flex-row">
    <div class="self-center mr-2">
        Project:
    </div>
    <button class="bg-blue-500 text-white rounded-lg px-4 py-2 flex justify-between items-center" on:click={() => isDropdownOpen = !isDropdownOpen}>
        <span>{selectedProject?.title??''}</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
    </button>
    {#if isDropdownOpen}
        <div class="relative">
            <div class="absolute z-10 mt-2 w-64 bg-white rounded-lg shadow-lg -left-48 top-8">
                {#each Object.entries(groupedProjects) as [category, projects]}
                    <h2 class="text-lg text-blue-600 pl-2 bg-gray-200">{category}</h2>
                    {#each projects as project, i}
                        <a 
                            class="block px-4 py-2 text-gray-800 hover:bg-blue-500 hover:text-white" 
                            class:disabled={(project.status??'inactive') !== 'active'}
                            on:click={() => { selectedTab = project.id; isDropdownOpen = false; }}>
                            {project.title}
                            {#if (project.status??'inactive') !== 'active'}
                                <span class="text-xs text-red-500">Coming soon!</span>
                            {:else if project.realtime??false}
                                <span class="text-xs text-green-500">Realtime</span>
                            {/if}
                        </a>
                    {/each}
                {/each}
            </div>
        </div>
    {/if}
</div>    
<div class="hidden md:flex md:flex-wrap md:justify-center md:items-center">
    <nav class="flex flex-row space-x-2">
    {#each Object.entries(groupedProjects) as [category, projects]}
        <div class="flex flex-col space-y-2">
        <h2 class="text-lg ml-2">{category}</h2>
        {#each projects as project, i}
            <a 
                class="cursor-pointer border-transparent rounded-xl w-36 flex flex-col justify-between
                 py-2 h-24 px-3 border-b-4 font-semibold
                hover:text-gray-700 dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-300 
                bg-blue-200 dark:bg-blue-900 hover:bg-blue-300 dark:hover:bg-blue-700
                {selectedTab === project.id ? 'text-white !bg-blue-500 dark:!bg-blue-500' : 'text-gray-500 dark:text-gray-200'}" 
                class:disabled={(project.status??'inactive') !== 'active'}
                on:click={() => selectedTab = project.id}>
                <div>
                    <div>{project.title}</div>
                    <div class='text-xs'>{project.type}</div>
                </div>
                <div>
                    {#if (project.status??'inactive') !== 'active'}
                        <div class="text-xs text-red-500 dark:text-red-300">Coming soon!</div>
                    {:else if project.realtime??false}
                        <div class="text-xs text-green-500 dark:text-green-300">Realtime Data ⚡</div>
                    {/if}
                </div>
            </a>
        {/each}
        </div>
    {/each}
    </nav>
</div>
<div class="m-0 md:mx-8 mt-4">
    {#if selectedProject}
        <Project project={selectedProject} wallet={walletId} />
    {/if}
</div>

<style>
    .disabled {
        cursor: not-allowed;
        pointer-events: none;
        background-color: gray;
    }
</style>

