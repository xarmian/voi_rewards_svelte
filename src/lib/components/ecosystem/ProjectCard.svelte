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
      <div class="absolute top-4 right-4 px-3 py-1 bg-gradient-to-r from-green-400 to-emerald-500 text-white text-xs font-medium rounded-full shadow-lg shadow-green-500/20 z-10">
        New
      </div>
    {/if}
    <div class="flex flex-col justify-between p-8 h-full space-y-6">
        <div class="space-y-6">
            <div class="flex flex-col space-y-6">
                {#if project.logo}
                    <div class="relative group isolate">
                        <!-- Ambient glow effect -->
                        <div class="absolute inset-0 bg-gradient-to-br from-violet-500/30 via-fuchsia-500/30 to-pink-500/30 opacity-0 group-hover:opacity-100 -z-10 blur-3xl transition-all duration-500 ease-out"></div>
                        
                        <!-- Main container -->
                        <div class="relative flex items-center justify-center h-40 p-8 rounded-3xl 
                            bg-gradient-to-br {
                                project.logo_dark_mode === 'light-bg' ? 'dark:from-white/20 dark:to-white/10 from-white/95 to-white/75' :
                                project.logo_light_mode === 'dark-bg' ? 'from-gray-900/90 to-gray-900/80 dark:from-gray-900 dark:to-gray-800' :
                                'from-white/95 to-white/75 dark:from-gray-900 dark:to-gray-800'
                            }
                            border border-white/30 dark:border-white/10
                            shadow-[0_8px_32px_-8px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)]
                            group-hover:shadow-[0_16px_48px_-12px_rgba(139,92,246,0.3)] dark:group-hover:shadow-[0_16px_48px_-12px_rgba(139,92,246,0.3)]
                            group-hover:border-violet-200/50 dark:group-hover:border-violet-700/50
                            backdrop-blur-sm
                            transition-all duration-500 ease-out">
                            
                            <!-- Logo container -->
                            <div class="relative w-full max-w-[280px] h-24">
                                <img 
                                    src={project.logo} 
                                    alt={project.title} 
                                    class="w-full h-full object-contain {
                                        project.logo_dark_mode === 'invert' ? 'dark:invert dark:brightness-[1.7]' : 
                                        project.logo_dark_mode === 'light-bg' ? 'dark:brightness-[1.7]' :
                                        project.logo_light_mode === 'invert' ? 'invert brightness-[0.85]' :
                                        ''
                                    } transition-all duration-500 ease-out group-hover:scale-110 group-hover:brightness-110" 
                                />
                            </div>
                        </div>
                    </div>
                {:else}
                    <div class="relative group isolate">
                        <!-- Ambient glow effect -->
                        <div class="absolute inset-0 bg-gradient-to-br from-violet-500/40 via-fuchsia-500/40 to-pink-500/40 opacity-0 group-hover:opacity-100 -z-10 blur-3xl transition-all duration-500 ease-out"></div>
                        
                        <!-- Main container -->
                        <div class="relative flex items-center justify-center h-40 
                            bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600
                            dark:from-violet-400 dark:via-fuchsia-500 dark:to-pink-500
                            rounded-3xl shadow-lg
                            group-hover:shadow-[0_16px_48px_-12px_rgba(139,92,246,0.5)]
                            transition-all duration-500 ease-out
                            before:absolute before:inset-[1px] before:rounded-[23px] 
                            before:bg-gradient-to-br before:from-white/20 before:via-white/5 before:to-transparent 
                            dark:before:from-white/10 dark:before:via-white/5 dark:before:to-transparent/0 
                            before:pointer-events-none
                            after:absolute after:inset-0 after:rounded-3xl after:blur-xl after:bg-gradient-to-br 
                            after:from-violet-600/25 after:via-fuchsia-600/25 after:to-pink-600/25
                            dark:after:from-violet-400/25 dark:after:via-fuchsia-500/25 dark:after:to-pink-500/25 
                            after:-z-10 after:opacity-0 after:transition-opacity after:duration-500
                            group-hover:after:opacity-100">
                            <span class="text-5xl font-bold text-white tracking-tight drop-shadow-lg relative
                                before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:to-transparent 
                                before:blur-sm before:opacity-0 before:transition-opacity before:duration-500
                                group-hover:before:opacity-100">
                                {project.title[0]}
                            </span>
                        </div>
                    </div>
                {/if}
                
                <div class="flex items-center justify-between">
                    <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 dark:from-violet-300 dark:via-fuchsia-300 dark:to-pink-300">{project.title}</h2>
                    <button 
                        on:click|stopPropagation|preventDefault={handleCategoryClick}
                        class="px-4 py-1.5 text-sm font-medium
                            bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-pink-500/10 dark:from-violet-400/10 dark:via-fuchsia-400/10 dark:to-pink-400/10
                            hover:from-violet-500/20 hover:via-fuchsia-500/20 hover:to-pink-500/20 dark:hover:from-violet-400/20 dark:hover:via-fuchsia-400/20 dark:hover:to-pink-400/20
                            text-violet-700 dark:text-violet-200
                            rounded-full shadow-sm transition-all duration-300 ease-out
                            border border-violet-500/20 dark:border-violet-400/20
                            hover:border-violet-500/30 dark:hover:border-violet-400/30"
                    >
                        {project.category}
                    </button>
                </div>
            </div>
            
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed">{project.description}</p>
        </div>
        
        <div class="flex space-x-6">
            {#if project.url}
            <button 
                on:click|stopPropagation={() => window.open(project.url, '_blank', 'noopener,noreferrer')}
                class="group flex items-center space-x-2 text-violet-600 dark:text-violet-300 transition-colors duration-300"
            >
                <i class="fas fa-globe text-lg transition-transform duration-300 group-hover:scale-110 group-hover:text-pink-500 dark:group-hover:text-pink-400"></i>
                <span class="font-medium relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-px after:bg-gradient-to-r after:from-violet-500 after:to-pink-500 after:transition-all after:duration-300 group-hover:after:w-full">Website</span>
            </button>
            {/if}
            {#if project.twitter}
            <button 
                on:click|stopPropagation={() => window.open(project.twitter, '_blank', 'noopener,noreferrer')}
                class="group flex items-center space-x-2 text-violet-600 dark:text-violet-300 transition-colors duration-300"
            >
                <i class="fab fa-x-twitter text-lg transition-transform duration-300 group-hover:scale-110 group-hover:text-pink-500 dark:group-hover:text-pink-400"></i>
                <span class="font-medium relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-px after:bg-gradient-to-r after:from-violet-500 after:to-pink-500 after:transition-all after:duration-300 group-hover:after:w-full">Twitter</span>
            </button>
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
