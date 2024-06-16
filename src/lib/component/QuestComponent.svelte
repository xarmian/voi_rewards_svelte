<script lang="ts">
    import type { IProject } from "$lib/data/types.js";
    import projects from "../../routes/(site)/phase2/[...slug]/projects.js";
	import ProjectSlideout from "../../routes/(site)/quests/ProjectSlideout.svelte";

    export let walletId: string | undefined;
    console.log(walletId);
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

    let selectedProject: IProject | undefined = undefined;

    $: {
        selectedProject = projects.find((project) => project.id == selectedTab);
    }

</script>
<div class="hidden place-self-center flex-row">
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
                            class="block px-4 py-2 text-black hover:bg-blue-500 hover:text-white" 
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
<div class="flex flex-wrap sm:justify-center mx-auto {selectedTab ? 'blur-sm' : ''}">
    <div class="flex flex-col sm:w-full lg:w-3/4 ml-2">
    {#each Object.entries(groupedProjects) as [category, projects]}
        <div class="flex flex-col">
            <h2 class="text-lg ml-3">{category}</h2>
            <div class="flex flex-row flex-wrap">
                {#each projects as project, i}
                    <a 
                        class="cursor-pointer border rounded-xl w-48 flex flex-col justify-between
                        py-2 h-36 px-3 font-semibold ml-2 my-2 shadow-xl
                    dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-300 
                        bg-blue-100 border-blue-50 dark:border-blue-800 dark:bg-blue-900 hover:bg-blue-300 dark:hover:bg-blue-800
                        {selectedTab === project.id ? 'text-white !bg-blue-500 dark:!bg-blue-500' : 'text-black dark:text-gray-200'}" 
                        class:disabled={(project.status??'inactive') !== 'active'}
                        on:click={() => selectedTab = project.id}>
                        <div>
                            <div>{project.title}</div>
                            <div class='text-xs'>{project.type}</div>
                        </div>
                        <div class="text-sm">{project.quests.length} quests</div>
                        <div>
                            {#if (project.status??'inactive') !== 'active'}
                                <div class="text-xs text-red-500 dark:text-red-300">Coming soon!</div>
                            {:else if project.realtime??false}
                                <div class="text-xs text-green-800 dark:text-green-300">Realtime Data ⚡</div>
                            {:else}
                                <div>&nbsp;</div>
                            {/if}
                        </div>
                    </a>
                {/each}
            </div>
        </div>
    {/each}
    </div>
</div>
<!--<div class="m-0 md:mx-8 mt-4">
    {#if selectedProject}
        <Project project={selectedProject} wallet={walletId} />
    {/if}
</div>-->
{#if selectedTab}
    <ProjectSlideout bind:projectid={selectedTab} bind:walletId={walletId}></ProjectSlideout>
{/if}

<style>
    .disabled {
        cursor: not-allowed;
        pointer-events: none;
        background-color: gray;
    }
</style>

