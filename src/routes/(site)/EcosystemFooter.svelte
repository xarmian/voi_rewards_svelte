<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchProjects } from './phase2/[...slug]/projects';
	import type { IProject } from '$lib/data/types';

	let projects: IProject[] = [];

	onMount(async () => {
		projects = await fetchProjects();
		projects = projects.filter(p => p.status === 'active');
	});
</script>

		<div class="w-full overflow-hidden mb-8">
			<p class="text-sm text-gray-500 dark:text-gray-400 font-semibold">Voi Ecosystem Projects</p>
			<div class="relative">
				<div class="flex overflow-x-auto space-x-2 py-4 px-2 scrollbar-hide">
					{#each projects as project}
						<a
							href={project.url}
							target="_blank"
							rel="noopener noreferrer"
							class="flex-shrink-0 group w-24"
						>
							<div class="w-24 h-24 rounded-lg bg-gray-200 dark:bg-gray-700 p-2 flex items-center justify-center border border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors">
								{#if project.logo}
									<img
										src={project.logo}
										alt={project.title}
										class="max-w-full max-h-full object-contain"
									/>
								{:else}
									<span class="text-sm text-center text-gray-600 dark:text-gray-300">
										{project.title}
									</span>
								{/if}
							</div>
							<p class="text-xs text-center mt-2 text-gray-500 dark:text-gray-400 group-hover:text-purple-500 break-words hyphens-auto">
								{project.title}
							</p>
						</a>
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

