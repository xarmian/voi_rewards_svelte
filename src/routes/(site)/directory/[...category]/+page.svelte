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

<div class="flex flex-col md:flex-row items-center mt-4 mb-4 justify-between">
  <span> </span>
  <h1 class="text-5xl font-bold text-center mb-4 text-emerald-600 dark:text-[#00ff00] glow-text uppercase tracking-wider">Voi Directory 🚀</h1>
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
      class="w-full md:w-1/3 px-4 py-2 rounded-lg bg-white dark:bg-black border border-emerald-600 dark:border-[#00ff00] text-emerald-600 dark:text-[#00ff00] placeholder-emerald-400 dark:placeholder-[#00ff00]/50 mb-4 md:mb-0 shadow-neon focus:ring-2 focus:ring-emerald-600 dark:focus:ring-[#00ff00] focus:outline-none"
    />
    <div class="flex flex-wrap justify-center gap-2">
      {#each categories as category}
        <button
          class="px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 transform hover:scale-105 
          {selectedCategory === category ? 
            'bg-emerald-600 dark:bg-[#00ff00] text-white dark:text-black shadow-neon' : 
            'bg-white dark:bg-black border border-emerald-600 dark:border-[#00ff00] text-emerald-600 dark:text-[#00ff00] hover:bg-emerald-100 dark:hover:bg-[#00ff00]/20'}"
          on:click={() => {
            selectedCategory = category;
            updateURL(category);
          }}
        >
          {category}
        </button>
      {/each}
      <button
        class="px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 transform hover:scale-105 
        {selectedCategory === 'New' ? 
          'bg-pink-600 dark:bg-[#ff00ff] text-white dark:text-black shadow-neon-pink' : 
          'bg-white dark:bg-black border border-pink-600 dark:border-[#ff00ff] text-pink-600 dark:text-[#ff00ff] hover:bg-pink-100 dark:hover:bg-[#ff00ff]/20'}"
        on:click={() => {
          selectedCategory = 'New';
          updateURL('New');
        }}
      >
        New 💎
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
    <p class="text-center text-2xl mt-16 text-gray-700 text-gray-300">Projects Loading...</p>
  {/if}
</div>

<style>
  .glow-text {
    text-shadow: 0 0 10px #00ff00;
  }

  @media (prefers-color-scheme: light) {
    .glow-text {
      text-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
    }
    .shadow-neon {
      box-shadow: 0 0 15px #00ff00;
    }

    .shadow-neon-pink {
      box-shadow: 0 0 15px #ff00ff;
    }
  }

  .shadow-neon {
    box-shadow: 0 0 15px rgba(16, 185, 129, 0.5);
  }

  .shadow-neon-pink {
    box-shadow: 0 0 15px rgba(219, 39, 119, 0.5);
  }

  @media (prefers-color-scheme: dark) {
    .shadow-neon {
      box-shadow: 0 0 15px #00ff00;
    }

    .shadow-neon-pink {
      box-shadow: 0 0 15px #ff00ff;
    }
  }

  /* Add highlighting effects */
  :global button:hover {
    filter: brightness(1.2);
    text-shadow: 0 0 8px #00ff00;
  }

  :global button.selected {
    text-shadow: 0 0 8px #00ff00;
  }

  :global button:hover:active {
    filter: brightness(0.8);
  }

  /* Light mode highlighting */
  button:hover {
    filter: brightness(1.05);
    text-shadow: 0 0 8px rgba(16, 185, 129, 0.3);
  }

  button.selected {
    text-shadow: 0 0 8px rgba(16, 185, 129, 0.3);
  }

  button:hover:active {
    filter: brightness(0.95);
  }

  /* Special handling for the New button */
  :global button:hover:last-child {
    text-shadow: 0 0 8px #ff00ff;
  }

  button:hover:last-child {
    text-shadow: 0 0 8px rgba(219, 39, 119, 0.3);
  }

  /* Input highlighting */
  input:focus {
    animation: glow 1.5s ease-in-out infinite alternate;
  }

  @keyframes glow {
    from {
      box-shadow: 0 0 5px rgba(16, 185, 129, 0.5),
                0 0 10px rgba(16, 185, 129, 0.5),
                0 0 15px rgba(16, 185, 129, 0.5);
    }
    to {
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.7),
                0 0 20px rgba(16, 185, 129, 0.7),
                0 0 25px rgba(16, 185, 129, 0.7);
    }
  }

  :global input:focus {
    animation: glow-dark 1.5s ease-in-out infinite alternate;
  }

  @keyframes glow-dark {
    from {
      box-shadow: 0 0 5px #00ff00,
                0 0 10px #00ff00,
                0 0 15px #00ff00;
    }
    to {
      box-shadow: 0 0 10px #00ff00,
                0 0 20px #00ff00,
                0 0 25px #00ff00;
    }
  }
</style>