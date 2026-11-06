<script lang="ts">
	import Markdown from 'svelte-markdown';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import { Button, Card, CopyButton, InlineAlert } from '$lib/ds';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import type { PageData } from './$types';
	import { copyUrl, filterGroups, slugify, visibleAfterResolve } from './faqView';

	let { data }: { data: PageData } = $props();
	let selectedCategory = $state('All');
	let searchQuery = $state('');
	let openIds = $state(new Set<string>());
	let questionNotFound = $state(false);
	let categories = $derived(['All', ...new Set(data.faqData.map((item) => item.category))]);
	let groups = $derived(filterGroups(data.faqData, selectedCategory, searchQuery));
	let resultCount = $derived(
		Object.values(groups).reduce((count, items) => count + items.length, 0)
	);
	let expandAll = $derived(data.faqData.every((item) => openIds.has(slugify(item.question))));

	function clearFilters() {
		selectedCategory = 'All';
		searchQuery = '';
	}

	// One set controls both bulk and individual toggles. Closing one after Expand all
	// removes just that ID; Collapse all empties the set, including individually opened items.
	function toggleAll() {
		openIds = expandAll ? new Set() : new Set(data.faqData.map((item) => slugify(item.question)));
	}

	function toggleQuestion(id: string, open: boolean) {
		// Native toggle also fires for state-driven changes; ignore those echoes.
		if (openIds.has(id) === open) return;
		const next = new Set(openIds);
		if (open) next.add(id);
		else next.delete(id);
		openIds = next;
	}

	async function arriveAtHash() {
		const hash = location.hash;
		const result = visibleAfterResolve(data.faqData, hash, {
			category: selectedCategory,
			query: searchQuery
		});
		selectedCategory = result.category;
		searchQuery = result.query;
		questionNotFound = Boolean(hash && !result.faq);
		if (!result.faq) return;
		openIds = new Set([slugify(result.faq.question)]);
		await tick();
		if (location.hash !== hash) return;
		const element = document.getElementById(slugify(result.faq.question));
		element?.scrollIntoView({ block: 'start' });
		element?.querySelector('summary')?.focus({ preventScroll: true });
	}

	function selectRecent(event: MouseEvent, question: string) {
		event.preventDefault();
		const hash = `#${slugify(question)}`;
		// Re-selecting the current hash must also reveal a filtered or closed question.
		if (location.hash === hash) void arriveAtHash();
		else location.hash = hash;
	}

	onMount(() => {
		const handleHashChange = () => void arriveAtHash();
		void arriveAtHash();
		window.addEventListener('hashchange', handleHashChange);
		return () => window.removeEventListener('hashchange', handleHashChange);
	});
</script>

<svelte:head>
	<title>{data.pageMetaTags.title}</title>
	<meta name="description" content={data.pageMetaTags.description} />
	<meta property="og:title" content={data.pageMetaTags.title} />
	<meta property="og:description" content={data.pageMetaTags.description} />
	<meta property="og:image" content={data.pageMetaTags.imageUrl} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={data.pageMetaTags.title} />
	<meta name="twitter:description" content={data.pageMetaTags.description} />
	<meta name="twitter:image" content={data.pageMetaTags.imageUrl} />
</svelte:head>

<div class="container-page space-y-8 py-8 text-ink md:py-12">
	<header class="max-w-3xl">
		<a href="/how_to_node" class="text-label text-accent underline underline-offset-4"
			>← Run a node</a
		>
		<h1 class="mt-4 text-display">Frequently Asked Questions</h1>
		<p class="mt-4 text-body text-ink-muted">
			Find answers to common questions about Voi Network, staking and running a node.
		</p>
	</header>

	<Card>
		<div class="grid min-w-0 gap-bento sm:grid-cols-2">
			<div class="min-w-0">
				<label for="faq-category" class="mb-2 block text-label">Category</label>
				<select
					id="faq-category"
					bind:value={selectedCategory}
					class="min-h-11 w-full min-w-0 rounded-ds-sm border border-edge bg-surface px-3 py-2 text-body text-ink"
				>
					{#each categories as category}
						<option value={category}>{category}</option>
					{/each}
				</select>
			</div>
			<div class="min-w-0">
				<label for="faq-search" class="mb-2 block text-label">Search questions</label>
				<input
					id="faq-search"
					type="search"
					bind:value={searchQuery}
					placeholder="Search questions and answers"
					class="min-h-11 w-full min-w-0 rounded-ds-sm border border-edge bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-muted"
				/>
			</div>
		</div>
		<div class="mt-4 flex flex-wrap items-center gap-3">
			<Button variant="soft" onclick={toggleAll}>{expandAll ? 'Collapse all' : 'Expand all'}</Button
			>
			<p class="text-body text-ink-muted" aria-live="polite">
				{resultCount}
				{resultCount === 1 ? 'question' : 'questions'} found
			</p>
		</div>
	</Card>

	{#if questionNotFound}
		<InlineAlert message="Question not found" tone="warn" />
	{/if}

	<div class="grid min-w-0 gap-bento">
		{#each Object.entries(groups) as [category, items] (category)}
			<Card title={category}>
				<div class="divide-y divide-line">
					{#each items as item (item.question)}
						<div class="relative min-w-0 py-4">
							<details
								id={slugify(item.question)}
								open={openIds.has(slugify(item.question))}
								ontoggle={(event) =>
									toggleQuestion(slugify(item.question), event.currentTarget.open)}
								class="min-w-0 scroll-mt-6"
							>
								<summary class="cursor-pointer break-words pr-14 text-body font-bold">
									{#each item.question.split('**') as part, index}
										{#if index % 2 === 0}{part}{:else}<strong class="text-accent">{part}</strong
											>{/if}
									{/each}
								</summary>
								<div
									class="markdown mt-3 min-w-0 max-w-none break-words text-body text-ink [overflow-wrap:anywhere]"
								>
									<Markdown source={item.answer} renderers={{ link: ExternalLink }} />
								</div>
							</details>
							<div class="absolute right-0 top-3">
								<CopyButton
									text={copyUrl(page.url.origin, page.url.pathname, item.question)}
									what="link to this question"
								/>
							</div>
						</div>
					{/each}
				</div>
			</Card>
		{:else}
			<Card>
				<p class="mb-4 text-body text-ink-muted">No FAQs found matching your search criteria.</p>
				<Button variant="soft" onclick={clearFilters}>Clear filters</Button>
			</Card>
		{/each}
	</div>

	{#if data.recentFAQs.length > 0}
		<section aria-labelledby="recent-questions" class="min-w-0">
			<h2 id="recent-questions" class="text-h2">Recently added</h2>
			<ul class="mt-4 space-y-3">
				{#each data.recentFAQs as faq (faq.question)}
					<li class="min-w-0">
						<a
							href={`#${slugify(faq.question)}`}
							onclick={(event) => selectRecent(event, faq.question)}
							class="break-words text-body text-accent underline underline-offset-4"
						>
							{#each faq.question.split('**') as part, index}
								{#if index % 2 === 0}{part}{:else}<strong>{part}</strong>{/if}
							{/each}
						</a>
						<p class="text-label text-ink-muted">{faq.category}</p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
