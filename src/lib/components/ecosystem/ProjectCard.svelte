<script lang="ts">
	import type { IProject } from '$lib/data/types';
	import { Card, Chip } from '$lib/ds';

	let { project, categoryHref }: { project: IProject; categoryHref: string } = $props();
</script>

<article class="min-w-0 [overflow-wrap:anywhere]">
	<Card>
		<div class="flex items-center gap-3">
			{#if project.logo}
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-ds-sm p-1 {project.logo_dark_mode ===
					'light-bg'
						? 'dark:bg-ink/20'
						: project.logo_light_mode === 'dark-bg'
							? 'bg-ink dark:bg-surface-2'
							: 'bg-transparent'}"
				>
					<img
						src={project.logo}
						alt=""
						class="h-full w-full object-contain {project.logo_dark_mode === 'invert'
							? 'dark:invert dark:brightness-[1.7]'
							: project.logo_dark_mode === 'light-bg'
								? 'dark:brightness-[1.7]'
								: project.logo_light_mode === 'invert'
									? 'invert brightness-[0.85]'
									: ''}"
					/>
				</div>
			{:else}
				<span
					aria-hidden="true"
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-ds-sm bg-accent-soft text-h2 text-accent"
					>{project.title[0]}</span
				>
			{/if}
			<h2 class="min-w-0 text-h2">{project.title}</h2>
		</div>
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<a
				href={categoryHref}
				data-sveltekit-noscroll
				data-sveltekit-keepfocus
				class="inline-flex min-h-11 max-w-full items-center text-label text-accent underline underline-offset-4"
				>{project.category}</a
			>
			{#if project.new}<Chip label="New" />{/if}
		</div>
		<p class="mt-2 text-body text-ink-muted">{project.description}</p>
		{#if project.url || project.twitter}
			<div class="mt-3 flex flex-wrap gap-x-5">
				{#if project.url}
					<a
						href={project.url}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex min-h-11 items-center text-label text-accent underline underline-offset-4"
						>Website<span class="sr-only"> (opens in a new tab)</span></a
					>
				{/if}
				{#if project.twitter}
					<a
						href={project.twitter}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex min-h-11 items-center text-label text-accent underline underline-offset-4"
						>Twitter<span class="sr-only"> (opens in a new tab)</span></a
					>
				{/if}
			</div>
		{/if}
	</Card>
</article>
