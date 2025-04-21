<script lang="ts">
  import type { AppInfo } from './apps';
  
  export let app: AppInfo;
  
  // Fallback function for image error
  const handleImageError = (event: Event) => {
    const imgElement = event.target as HTMLImageElement;
    imgElement.src = '/logos/voi_logo.png';
  };
  
  // Get category colors
  $: categoryColor = app.category === 'defi' 
    ? { accent: 'text-blue-600 dark:text-blue-400', pill: 'bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-300' }
    : app.category === 'nft' 
      ? { accent: 'text-purple-600 dark:text-purple-400', pill: 'bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-300' }
      : { accent: 'text-green-600 dark:text-green-400', pill: 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-300' };
  
  // Category label
  $: categoryLabel = app.category ? app.category.charAt(0).toUpperCase() + app.category.slice(1) : 'Utility';
  
  // Get logo inversion classes
  $: logoInversionClass = app.invert_logo_dark && app.invert_logo_light 
    ? 'invert dark:invert-0' 
    : app.invert_logo_dark 
      ? 'dark:invert' 
      : app.invert_logo_light 
        ? 'invert' 
        : '';
</script>

<a 
  href={app.url} 
  target="_blank" 
  rel="noopener noreferrer"
  class="group flex flex-col items-center p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-300 hover:translate-y-[-3px] hover:scale-[1.02] h-full relative overflow-hidden"
>
  <!-- Category pill -->
  <div class="absolute top-2 right-2 text-xs font-medium px-2 py-0.5 rounded-full {categoryColor.pill}">
    {categoryLabel}
  </div>
  
  <!-- Logo container with subtle shadow and border -->
  <div class="w-48 h-24 mb-4 flex items-center justify-center bg-gray-50 dark:bg-gray-700 p-3 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 group-hover:shadow-md group-hover:border-opacity-50 transition-all duration-300">
    <img 
      src={app.logoPath} 
      alt={`${app.name} logo`} 
      class="max-w-full max-h-full object-contain {logoInversionClass}" 
      loading="lazy"
      on:error={handleImageError}
    />
  </div>
  
  <!-- Name and description -->
  <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-2 text-center group-hover:{categoryColor.accent} transition-colors duration-200">{app.name}</h3>
  <p class="text-sm text-gray-600 dark:text-gray-400 text-center">{app.description}</p>
  
  <!-- Action hint -->
  <div class="mt-3 text-xs font-medium {categoryColor.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300">
    Open App →
  </div>
</a> 