<script lang="ts">
	import { onMount } from 'svelte';
	import type { IProject } from '$lib/data/types';

	let projects: IProject[] = [];

	onMount(async () => {
		try {
			const response = await fetch('/api/ecosystem');
			if (!response.ok) {
				throw new Error('Failed to fetch ecosystem projects');
			}
			projects = await response.json();
		} catch (error) {
			console.error('Error loading ecosystem projects:', error);
			projects = [];
		}
	});
</script>

		<div class="w-full overflow-hidden mb-8">
			<p class="text-sm text-gray-500 dark:text-gray-400 font-semibold">Voi Ecosystem Projects</p>
			<div class="relative">
				<div class="flex overflow-x-auto space-x-2 py-4 px-2 scrollbar-hide">
					{#each projects as project}
						<button
							on:click={() => window.open(project.url, '_blank', 'noopener,noreferrer')}
							class="flex-shrink-0 group w-24"
						>
							<div class="w-24 h-24 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center border border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors">
								{#if project.logo}
									<div class="w-full h-full flex items-center justify-center">
										<div class="p-4 rounded-lg {
											project.logo_dark_mode === 'light-bg' ? 'dark:bg-white/20' : 
											project.logo_light_mode === 'dark-bg' ? 'bg-gray-800/50' :
											'bg-transparent'
										}">
											<img
												src={project.logo}
												alt={project.title}
												class="max-w-full max-h-full object-contain {
													project.logo_dark_mode === 'invert' ? 'dark:invert dark:brightness-0' : 
													project.logo_light_mode === 'invert' ? 'invert brightness-0 dark:invert-0 dark:brightness-100' :
													''
												} transition-all duration-300"
											/>
										</div>
									</div>
								{:else}
									<span class="text-sm text-center text-gray-600 dark:text-gray-300">
										{project.title}
									</span>
								{/if}
							</div>
							<p class="text-xs text-center mt-2 text-gray-600 dark:text-gray-400 font-medium group-hover:text-purple-500 break-words hyphens-auto min-h-10 transition-colors duration-300">
								{project.title}
							</p>
						</button>
					{/each}
				</div>
			</div>
		</div>


<style>
	/* Hide scrollbar but keep functionality */
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>

