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
<div class="flex flex-wrap sm:justify-center mx-auto {selectedTab ? 'blur-sm' : ''}">
    <div class="flex flex-col sm:w-full lg:w-full m-2">
    {#each Object.entries(groupedProjects) as [category, projects]}
        <div class="flex flex-col mt-4">
            <h2 class="text-xl font-semibold py-2 px-4 bg-purple-900 text-white rounded-lg shadow-md">
                {category}
            </h2>            <div class="flex flex-row flex-wrap">
                {#each projects as project, i}
                    <a 
                        class="cursor-pointer border rounded-xl w-full sm:w-1/3 h-52 flex flex-col justify-between
                        py-2 px-3 font-semibold m-2 my-2 shadow-xl
                    text-black hover:border-gray-800 dark:hover:border-white
                        bg-blue-100 border-blue-50 dark:border-blue-700 dark:bg-[#65DBAB]
                        " 
                        class:disabled={(project.status??'inactive') !== 'active'}
                        on:click={() => selectedTab = project.id}>
                        <div class="flex-col justify-between">
                            {#if project.logo}
                                <img src={project.logo} alt={project.title} class="h-12" />
                            {:else}
                                <div>{project.title}</div>
                            {/if}
                            <div class='text-sm'>{project.type}</div>
                        </div>
                        <div class="">{project.quests.length} quest{project.quests.length > 1 ? 's' : ''}</div>
                        <div class="flex justify-end">
                            {#if (project.status??'inactive') !== 'active'}
                                <div class="text-sm text-red-500 dark:text-red-300">Coming soon!</div>
                            {:else if project.realtime??false}
                                <div class="text-sm text-green-900">Realtime Data ⚡</div>
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

