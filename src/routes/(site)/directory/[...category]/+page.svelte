<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fetchProjects } from '../../phase2/[...slug]/projects';
  import type { IProject } from '$lib/data/types';
  import ProjectCard from '$lib/components/ecosystem/ProjectCard.svelte';
	import Share from '$lib/component/ui/Share.svelte';

  export let data;

  let projects: IProject[] = [];
  let filteredProjects: IProject[] = [];
  let searchTerm = '';
  let selectedCategory = data.category;

  // primary sorting for categories
  const categorySort = [ 'Wallets', 'DEXes', 'NFTs', 'Infrastructure', 'Tools' ];

  onMount(async () => {
    projects = await fetchProjects();
    filteredProjects = projects;
  });

  $: {
    filteredProjects = projects.filter(project => 
      project.status === 'active'
      && (project.title.toLowerCase().includes(searchTerm.toLowerCase())
      || project.description.toLowerCase().includes(searchTerm.toLowerCase())
      || project.category.toLowerCase().includes(searchTerm.toLowerCase()))
      && (
        selectedCategory === 'All' || 
        (selectedCategory === 'New' && project.new === true) || 
        project.category === selectedCategory
      )
    ).sort((a, b) => {
      const indexA = categorySort.indexOf(a.category);
      const indexB = categorySort.indexOf(b.category);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }

  $: categories = ['All', ...new Set(projects.filter(p => p.status === 'active').map(p => p.category))];
  
  function handleCategoryClick(event: CustomEvent<string>) {
    selectedCategory = event.detail;
    updateURL(selectedCategory);
  }

  function updateURL(category: string) {
    const newPath = category === 'All' ? '/directory' : `/directory/${category}`;
    goto(newPath, { replaceState: true });
  }

  let url = '';
  let text = '';

  $: if (selectedCategory !== 'All') {
    text = `${selectedCategory}? @Voi_Net has that. Check out ${selectedCategory} in the Voi Ecosystem, right here! #Voiagers`;
    url = data.url.href;
  }
  else {
    text = 'Do you know about the @Voi_Net Ecosystem Directory? Check it out here! #Voiagers';
    url = data.url.href;
  }
</script>

  <div class="flex flex-col md:flex-row items-center pt-4 mb-4 justify-between">
    <span> </span>
    <h1 class="text-5xl font-bold text-center mb-4">Voi Directory</h1>
    <div class="text-center md:self-start">
      <Share {url} {text} />
    </div>
  </div>
  <div class="container mx-auto px-4">
    
    <div class="flex flex-col md:flex-row justify-between items-center mb-4">
      <input
        type="text"
        placeholder="Search projects..."
        bind:value={searchTerm}
        class="w-full md:w-1/3 px-4 py-2 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white mb-4 md:mb-0"
      />
      <div class="flex flex-wrap justify-center gap-2">
        {#each categories as category}
          <button
            class="px-4 py-2 rounded-full text-sm font-semibold {selectedCategory === category ? 'bg-purple-600 dark:bg-purple-200 text-white dark:text-purple-800' : 'bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200'}"
            on:click={() => {
              selectedCategory = category;
              updateURL(category);
            }}
          >
            {category}
          </button>
        {/each}
        <button
          class="px-4 py-2 rounded-full text-sm font-semibold {selectedCategory === 'New' ? 'bg-red-600 dark:bg-red-200 text-white dark:text-red-800' : 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200'}"
          on:click={() => {
            selectedCategory = 'New';
            updateURL('New');
          }}
        >
          New
        </button>
      </div>
    </div>

    {#if filteredProjects.length > 0}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {#each filteredProjects as project (project.id)}
          <ProjectCard {project} on:categoryClick={handleCategoryClick} />
        {/each}
      </div>
    {:else}
      <p class="text-center text-2xl mt-16">Projects Loading...</p>
    {/if}
  </div>