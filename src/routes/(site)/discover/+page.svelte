<script lang="ts">
  import AppGrid from './AppGrid.svelte';
  import MarketData from './MarketData.svelte';
  import { apps, getAppsByCategory } from './apps';
  import { writable, derived } from 'svelte/store';
  
  // Create stores for filtering
  const currentCategory = writable<string | undefined>(undefined);
  const searchQuery = writable('');
  
  // Array of available categories (extracted from apps data)
  const categories = [...new Set(apps.map(app => app.category))].filter(Boolean) as string[];
  
  // Filtered apps based on the current category and search query
  $: filteredApps = derived(
    [currentCategory, searchQuery], 
    ([$currentCategory, $searchQuery]) => {
      // First filter by category
      let filtered = $currentCategory ? getAppsByCategory($currentCategory) : apps;
      
      // Then filter by search query if it exists
      if ($searchQuery.trim()) {
        const query = $searchQuery.toLowerCase();
        filtered = filtered.filter(app => 
          app.name.toLowerCase().includes(query) || 
          app.description.toLowerCase().includes(query)
        );
      }
      
      return filtered;
    }
  );
  
  // Function to set the active category
  const setCategory = (category?: string) => {
    currentCategory.set(category);
  };
  
  // Function to handle search input
  const handleSearch = (event: Event) => {
    const target = event.target as HTMLInputElement;
    searchQuery.set(target.value);
  };
</script>

<svelte:head>
  <title>Discover | Voi dApps</title>
  <meta name="description" content="Discover applications on the Voi blockchain" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
</svelte:head>

<div class="space-y-6">
  <!-- Header with market data -->
  <header class="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-6 rounded-xl shadow-md">
    <div class="flex flex-col items-center space-y-4">
      <h1 class="text-3xl font-bold">Discover Voi</h1>
      <p class="text-sm text-purple-100 mb-2">Explore essential applications on Voi Network</p>
      
      <MarketData />
      
      <!-- Search input -->
      <div class="w-full max-w-md mt-4">
        <div class="relative">
          <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            placeholder="Search apps..." 
            class="w-full py-2 pl-10 pr-4 text-gray-700 bg-white dark:bg-gray-900 dark:text-gray-300 border-none rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500"
            on:input={handleSearch}
          />
        </div>
      </div>
    </div>
  </header>
  
  <!-- Category filters (horizontal scrollable on mobile) -->
  <div class="overflow-x-auto whitespace-nowrap pb-3 hide-scrollbar">
    <div class="inline-flex space-x-3 px-1">
      <button 
        class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 backdrop-blur-sm border shadow-sm {$currentCategory === undefined 
          ? 'bg-purple-600 text-white border-purple-700 shadow-purple-500/20' 
          : 'bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/20'}"
        on:click={() => setCategory(undefined)}
      >
        All Apps
      </button>
      
      {#each categories as category}
        <button 
          class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 backdrop-blur-sm border shadow-sm {$currentCategory === category 
            ? 'bg-purple-600 text-white border-purple-700 shadow-purple-500/20' 
            : 'bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/20'}"
          on:click={() => setCategory(category)}
        >
          {category.charAt(0).toUpperCase() + category.slice(1)}
        </button>
      {/each}
    </div>
  </div>
  
  <!-- App grid -->
  <AppGrid apps={$filteredApps} showCategories={false} />
  
  <!-- No results -->
  {#if $filteredApps.length === 0}
    <div class="text-center py-10">
      <p class="text-lg text-gray-500 dark:text-gray-400">No applications found matching your criteria</p>
      <button 
        class="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg"
        on:click={() => {
          searchQuery.set('');
          currentCategory.set(undefined);
        }}
      >
        Clear filters
      </button>
    </div>
  {/if}
</div>

<style>
  /* Hide scrollbar but keep functionality */
  .hide-scrollbar {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
  }
  .hide-scrollbar::-webkit-scrollbar {
    display: none;  /* Chrome, Safari and Opera */
  }
</style>
