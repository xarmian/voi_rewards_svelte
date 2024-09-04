<script lang="ts">
  import ProjectBox from './ProjectBox.svelte';

    import type { IProject } from "$lib/data/types.js";
	import type { PLeaderboard } from "$lib/supabase.js";
    // import { fetchProjects } from "../../routes/(site)/phase2/[...slug]/projects.js";
	import ProjectSlideout from "../../routes/(site)/quests/ProjectSlideout.svelte";
	import { onMount } from 'svelte';
	import fetchProjects from '../../routes/(site)/phase2/[...slug]/projects';

    export let walletId: string | undefined;
    export let selectedTab = 0;
    export let leaderboardData: PLeaderboard | undefined = undefined;
    export let projects: IProject[] = [];

    onMount(async () => {
        if (projects.length == 0) {
            projects = await fetchProjects();
        }

            // sort projects with status='active' and realtime=true first, then by id
            projects.sort((a, b) => {
                if (a.status === 'active' && b.status !== 'active') return -1;
                if (a.status !== 'active' && b.status === 'active') return 1;
                if (a.realtime && !b.realtime) return -1;
                if (!a.realtime && b.realtime) return 1;
                return a.id - b.id;
            });


            projects.forEach(project => {
                if (project.title == 'Social Quests') return;
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

            sortedKeys.forEach(key => {
                sortedGroupedProjects[key] = groupedProjects[key];
            });

            groupedProjects = sortedGroupedProjects;
    });

    let isDropdownOpen: boolean = false;
    let groupedProjects: { [key: string]: IProject[] } = {};
    let sortedGroupedProjects: { [key: string]: IProject[] } = {};

    let selectedProject: IProject | undefined = undefined;

    $: {
        selectedProject = projects.find((project) => project.id == selectedTab);
    }
</script>
<div class="flex flex-wrap sm:justify-center mx-auto sm:w-3/4 {selectedTab ? 'blur-sm' : ''}">
    <div class="flex flex-col sm:w-full lg:w-full m-2">
    {#each Object.entries(groupedProjects) as [category, projects]}
        <div class="flex flex-col mt-4">
            <h2 class="text-xl font-semibold py-2 px-4 bg-purple-900 text-white rounded-lg shadow-md">
                {category}
            </h2>
            <div class="flex flex-row flex-wrap">
                {#each projects as project, i}
                    <ProjectBox bind:selectedTab {leaderboardData} {project} ></ProjectBox>
                {/each}
            </div>
        </div>
    {/each}
    </div>
</div>
{#if selectedTab}
    <ProjectSlideout bind:projectid={selectedTab} bind:walletId={walletId} {projects}></ProjectSlideout>
{/if}