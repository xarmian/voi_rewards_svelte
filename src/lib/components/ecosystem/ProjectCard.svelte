<script lang="ts">
  import type { IProject } from '$lib/data/types';
  import { createEventDispatcher } from 'svelte';

  export let project: IProject;
  
  const dispatch = createEventDispatcher();

  function handleCategoryClick(event: Event) {
    event.stopPropagation();
    dispatch('categoryClick', project.category);
  }

  function handleLinkClick(event: Event) {
    event.stopPropagation();
  }
</script>

<div class="card-wrapper">
  <a 
    href={project.url} 
    target="_blank" 
    rel="noopener noreferrer"
    class="card bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-all duration-300 ease-in-out hover:shadow-xl block relative"
  >
    {#if project.new}
      <div class="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-bl-lg z-10">
        New
      </div>
    {/if}
    <div class="flex flex-col justify-between p-6 h-full">
        <div>
            <div class="flex items-center justify-between mb-4">
                {#if project.logo}
                    <img src={project.logo} alt={project.title} class="h-12 object-contain" />
                {:else}
                    <div class="h-12 w-12 bg-purple-600 rounded-full flex items-center justify-center text-xl font-bold text-white">
                        {project.title[0]}
                    </div>
                {/if}
                <button 
                  on:click|stopPropagation|preventDefault={handleCategoryClick}
                  class="px-3 py-1 text-sm font-semibold text-purple-800 bg-purple-200 dark:bg-purple-800 dark:text-purple-200 rounded-full hover:bg-purple-300 transition-colors duration-200"
                >
                    {project.category}
                </button>
            </div>
            <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-2">{project.title}</h2>
            <p class="text-gray-600 dark:text-gray-300 mb-4">{project.description}</p>
        </div>
        <div class="flex space-x-4">
            {#if project.url}
            <a 
              href={project.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              class="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 transition-colors duration-200"
              on:click={handleLinkClick}
            >
                <i class="fas fa-globe"></i> Website
            </a>
            {/if}
            {#if project.twitter}
            <a 
              href={project.twitter} 
              target="_blank" 
              rel="noopener noreferrer" 
              class="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 transition-colors duration-200"
              on:click={handleLinkClick}
            >
                <i class="fab fa-x-twitter"></i>/Twitter
            </a>
            {/if}
        </div>
    </div>
  </a>
</div>

<style>
  .card-wrapper {
    display: grid;
    transition: transform 0.3s ease-in-out;
  }
  .card-wrapper:hover {
    transform: scale(1.02);
    z-index: 10;
  }
  .card {
    grid-area: 1 / 1 / 2 / 2;
  }
</style>
