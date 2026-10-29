<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cardHeadingId } from './id';

	interface Props {
		title?: string;
		// Keep titles unique on a page, or supply an explicit heading ID.
		id?: string;
		headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
		actions?: Snippet;
		variant?: 'surface' | 'hero';
		span?: { lg?: 3 | 4 | 5 | 6 | 7 | 8 | 12; md?: 1 | 2 };
		as?: 'section' | 'div';
		children: Snippet;
	}
	let {
		title,
		id,
		headingLevel = 2,
		actions,
		variant = 'surface',
		span,
		as = 'section',
		children
	}: Props = $props();
	const lg = {
		3: 'lg:col-span-3',
		4: 'lg:col-span-4',
		5: 'lg:col-span-5',
		6: 'lg:col-span-6',
		7: 'lg:col-span-7',
		8: 'lg:col-span-8',
		12: 'lg:col-span-12'
	};
	const md = { 1: 'md:col-span-1', 2: 'md:col-span-2' };
	let headingId = $derived(title ? (id ?? cardHeadingId(title)) : undefined);
</script>

<svelte:element
	this={title ? as : 'div'}
	aria-labelledby={title && as === 'section' ? headingId : undefined}
	class="min-w-0 p-card shadow-card {variant === 'hero'
		? 'on-hero rounded-card bg-hero text-on-hero'
		: 'rounded-card border border-line bg-surface text-ink'} {span?.md ? md[span.md] : ''} {span?.lg
		? lg[span.lg]
		: ''}"
>
	{#if title || actions}
		<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
			{#if title}<svelte:element this={`h${headingLevel}`} id={headingId} class="text-h2"
					>{title}</svelte:element
				>{/if}
			{#if actions}<div class="ml-auto min-w-0 max-w-full">{@render actions()}</div>{/if}
		</div>
	{/if}
	{@render children()}
</svelte:element>
