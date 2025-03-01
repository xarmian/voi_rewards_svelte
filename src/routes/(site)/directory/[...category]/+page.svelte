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

<div class="min-h-screen">
  <!-- Header Section -->
  <div class="relative">
    <!-- Background gradient -->
    <div class="absolute inset-0 -z-10 bg-gradient-to-br from-violet-50 via-white to-pink-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 opacity-40"></div>
    
    <!-- Content wrapper -->
    <div class="mx-auto max-w-7xl px-6 lg:px-8 pt-10 pb-24">
      <div class="flex flex-col md:flex-row items-center justify-between gap-8">
        <div class="w-12"></div>
        <div class="text-center">
          <h1 class="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 dark:from-violet-300 dark:via-fuchsia-300 dark:to-pink-300 mb-4">
            Voi Directory
          </h1>
          <p class="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Discover the innovative projects building on Voi
          </p>
        </div>
        <div class="md:self-start relative z-20">
          <Share {url} {text} />
        </div>
      </div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="container mx-auto px-4 -mt-12 pb-16 relative z-10">
    <div class="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-white/5 p-6">
      <!-- Search and Filters -->
      <div class="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
        <div class="relative w-full md:w-1/3">
          <div class="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <i class="fas fa-search text-gray-400 dark:text-gray-500"></i>
          </div>
          <input
            type="text"
            placeholder="Search projects..."
            bind:value={searchTerm}
            class="w-full pl-12 pr-4 py-3 rounded-2xl bg-white/50 dark:bg-gray-900/50 
                   border border-violet-100/50 dark:border-violet-400/10
                   text-gray-800 dark:text-white placeholder-gray-500 dark:placeholder-gray-400
                   focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:focus:ring-violet-400/20
                   transition-all duration-300"
          />
        </div>

        <div class="flex flex-wrap justify-center gap-2">
          {#each categories as category}
            <button
              class="px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300
                {selectedCategory === category ? 
                  'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 text-white shadow-lg shadow-violet-500/25' : 
                  'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-violet-100/50 dark:border-violet-400/10 hover:bg-violet-50 dark:hover:bg-violet-900/30'}"
              on:click={() => {
                selectedCategory = category;
                updateURL(category);
              }}
            >
              {category}
            </button>
          {/each}
          <button
            class="px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300
              {selectedCategory === 'New' ? 
                'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/25' : 
                'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-green-100/50 dark:border-green-400/10 hover:bg-green-50 dark:hover:bg-green-900/30'}"
            on:click={() => {
              selectedCategory = 'New';
              updateURL('New');
            }}
          >
            New
          </button>
        </div>
      </div>

      <!-- Projects Grid -->
      {#if filteredProjects.length > 0}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {#each filteredProjects as project (project.id)}
            <ProjectCard {project} on:categoryClick={handleCategoryClick} />
          {/each}
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="w-16 h-16 mb-4 rounded-full bg-gradient-to-br from-violet-500/20 to-pink-500/20 dark:from-violet-400/10 dark:to-pink-400/10 flex items-center justify-center">
            <i class="fas fa-spinner-third animate-spin text-2xl text-violet-500 dark:text-violet-400"></i>
          </div>
          <p class="text-2xl font-medium text-gray-600 dark:text-gray-300">Projects Loading...</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Add any additional styles here */
</style>