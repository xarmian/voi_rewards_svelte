<script lang="ts">
  import AppCard from './AppCard.svelte';
  import type { AppInfo } from './apps';
  
  export let apps: AppInfo[] = [];
  export let showCategories = false;
  
  // Group apps by category if showCategories is true
  $: categories = showCategories 
    ? apps.reduce((acc, app) => {
        const category = app.category || 'Other';
        if (!acc[category]) acc[category] = [];
        acc[category].push(app);
        return acc;
      }, {} as Record<string, AppInfo[]>)
    : { 'All': apps };
    
  // Format category name for display
  const formatCategory = (category: string): string => {
    return category.charAt(0).toUpperCase() + category.slice(1);
  };
</script>

<section>
  {#each Object.entries(categories) as [category, categoryApps]}
    {#if showCategories}
      <div class="mb-8">
        <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 px-1">
          {formatCategory(category)}
        </h2>
        <div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {#each categoryApps as app (app.id)}
            <AppCard {app} />
          {/each}
        </div>
      </div>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {#each categoryApps as app (app.id)}
          <AppCard {app} />
        {/each}
      </div>
    {/if}
  {/each}
</section> 