<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Card, InlineAlert, Tabs } from '$lib/ds';
	import ProjectCard from '$lib/components/ecosystem/ProjectCard.svelte';
	import { rowKeys } from '$lib/utils/rowKeys';
	import type { PageData } from './$types';
	import {
		categoriesOf,
		categoryHref,
		directoryView,
		fetchDirectoryProjects,
		filterProjects,
		formatReceivedAt,
		nextFeedState,
		orderProjects,
		type FeedState
	} from '../projects';

	let { data }: { data: PageData } = $props();
	let feed = $state.raw<FeedState>({ status: 'loading', projects: [], receivedAt: null });
	let refreshing = $state(false);
	let searchTerm = $state('');
	let selectedCategory = $derived(data.category);
	let activeProjects = $derived(filterProjects(feed.projects, { category: 'All', term: '' }));
	let categories = $derived(categoriesOf(activeProjects));
	let filteredProjects = $derived(
		orderProjects(filterProjects(activeProjects, { category: selectedCategory, term: searchTerm }))
	);
	// Duplicate feed IDs must not make a row unreachable.
	let projectKeys = $derived(rowKeys(filteredProjects, (project) => String(project.id)));
	let view = $derived(
		directoryView({
			status: feed.status,
			total: activeProjects.length,
			shown: filteredProjects.length
		})
	);
	let receivedLabel = $derived(feed.receivedAt === null ? '' : formatReceivedAt(feed.receivedAt));

	async function loadProjects() {
		if (refreshing) return;
		refreshing = true;
		const result = await fetchDirectoryProjects();
		feed = nextFeedState(feed, result, Date.now());
		refreshing = false;
	}

	onMount(() => {
		void loadProjects();
	});
</script>

<div
	class="container-page min-w-0 space-y-6 py-8 text-ink [overflow-wrap:anywhere] md:py-12"
	aria-busy={feed.status === 'loading' || refreshing}
>
	<header class="max-w-3xl space-y-4">
		<h1 class="text-display">Find your next tool on Voi</h1>
		<p class="text-body text-ink-muted">Explore projects, wallets and services building on Voi.</p>
		<Tabs
			variant="nav"
			label="Explore the ecosystem"
			onHero={false}
			current="projects"
			items={[
				{ id: 'projects', label: 'Projects', href: '/directory' },
				{ id: 'markets', label: 'Markets Beta', href: '/markets' }
			]}
		/>
	</header>

	<section aria-label="Project filters" class="space-y-4">
		<div class="w-full md:max-w-md">
			<label for="project-search" class="mb-2 block text-label">Search projects</label>
			<input
				id="project-search"
				type="search"
				bind:value={searchTerm}
				placeholder="Title, description or category"
				class="min-h-11 w-full min-w-0 rounded-ds-sm border border-edge bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-muted"
			/>
		</div>
		<nav aria-label="Categories" class="flex flex-wrap gap-2">
			{#each categories as category (category)}
				<a
					href={categoryHref(category)}
					data-sveltekit-noscroll
					data-sveltekit-keepfocus
					aria-current={selectedCategory === category ? 'page' : undefined}
					class="inline-flex min-h-11 max-w-full items-center rounded-ds-sm px-3 py-2 text-label {selectedCategory ===
					category
						? 'bg-accent-soft font-bold text-accent underline underline-offset-4'
						: 'text-ink-muted hover:bg-surface-2'}">{category}</a
				>
			{/each}
		</nav>
		{#if feed.receivedAt !== null}
			<div class="flex flex-wrap items-center gap-3">
				<p class="text-sm text-ink-muted">
					Retrieved {receivedLabel} · content age unknown
				</p>
				<Button variant="ghost" size="sm" onclick={loadProjects} disabled={refreshing}
					>Refresh</Button
				>
			</div>
		{/if}
	</section>

	<p aria-live="polite" class="sr-only">
		{#if feed.receivedAt !== null}{filteredProjects.length} projects{/if}
	</p>

	{#if feed.status === 'stale'}
		<InlineAlert
			tone="warn"
			message={`Stale · Retrieved ${receivedLabel}. The latest refresh failed.`}
			onretry={loadProjects}
		/>
	{/if}

	{#if view === 'loading'}
		<div role="status" class="text-body text-ink-muted">Loading projects</div>
		<div aria-hidden="true" class="grid grid-cols-1 gap-bento md:grid-cols-2 lg:grid-cols-3">
			{#each [1, 2, 3] as skeleton (skeleton)}
				<Card>
					<div class="h-10 w-10 rounded-ds-sm bg-surface-2"></div>
					<div class="mt-4 h-5 w-2/3 rounded-ds-sm bg-surface-2"></div>
					<div class="mt-3 h-16 rounded-ds-sm bg-surface-2"></div>
				</Card>
			{/each}
		</div>
	{:else if view === 'error'}
		<InlineAlert message="Couldn't load the directory" onretry={loadProjects} retryLabel="Retry" />
	{:else if view === 'empty'}
		<p class="text-h2">No projects are listed yet</p>
	{:else if view === 'no-match'}
		<div class="space-y-3">
			<h2 class="text-h2">No matching projects</h2>
			<p class="text-body text-ink-muted">
				{#if searchTerm}Search: “{searchTerm}”{/if}
				{#if searchTerm && selectedCategory !== 'All'}·{/if}
				{#if selectedCategory !== 'All'}Category: {selectedCategory}{/if}
			</p>
			<Button
				href="/directory"
				variant="soft"
				data-sveltekit-noscroll
				onclick={() => (searchTerm = '')}>Clear filters</Button
			>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-bento md:grid-cols-2 lg:grid-cols-3">
			{#each filteredProjects as project, i (projectKeys[i])}
				<ProjectCard {project} categoryHref={categoryHref(project.category)} />
			{/each}
		</div>
	{/if}
</div>
