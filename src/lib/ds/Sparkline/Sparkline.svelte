<script lang="ts">
	import { ago, compact } from '../format';
	import type { DataState } from '../types';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import { sparklinePath } from './geometry';
	let {
		values,
		label,
		height = 44,
		area = true,
		tone = 'accent',
		state: dataState = 'ready',
		onretry,
		asOf
	}: {
		values: number[];
		label: string;
		height?: number;
		area?: boolean;
		tone?: 'accent' | 'hi' | 'ok';
		state?: DataState;
		onretry?: () => void;
		asOf?: Date | number | string;
	} = $props();
	let width = $state(240);
	let container: HTMLDivElement;
	const strokes = { accent: 'stroke-accent-fill', hi: 'stroke-hi', ok: 'stroke-ok' };
	const fills = { accent: 'fill-accent-fill', hi: 'fill-hi', ok: 'fill-ok' };
	let geometry = $derived(sparklinePath(values, width, height, 4));
	$effect(() => {
		if (!container || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry.contentRect.width > 0) width = entry.contentRect.width;
		});
		observer.observe(container);
		return () => observer.disconnect();
	});
</script>

<div bind:this={container} class="min-w-0" aria-busy={dataState === 'loading' ? 'true' : undefined}>
	{#if dataState === 'loading'}
		<span class="sr-only">Loading {label}…</span>
		<div aria-hidden="true" class="w-full rounded-ds-xs bg-grid" style:height={`${height}px`}></div>
	{:else if dataState === 'error'}
		<InlineAlert message="Unable to load {label}." {onretry} />
	{:else if dataState === 'empty' || values.length === 0}
		<p class="flex items-center text-sm text-ink-muted" style:min-height={`${height}px`}>No data</p>
	{:else}
		<svg
			class="w-full"
			{height}
			viewBox="0 0 {width} {height}"
			role="img"
			aria-label="{label}: from {compact(values[0])} to {compact(values[values.length - 1])}"
			focusable="false"
		>
			{#if area}<path d={geometry.area} class="fill-accent-soft" />{/if}
			<path
				d={geometry.line}
				fill="none"
				class={strokes[tone]}
				stroke-width="2.2"
				stroke-linecap="round"
			/>
			{#if geometry.end}<circle
					cx={geometry.end.x}
					cy={geometry.end.y}
					r="2.5"
					class={fills[tone]}
				/>{/if}
		</svg>
	{/if}
	{#if dataState === 'stale'}
		<p class="mt-1 text-label text-warn"><span aria-hidden="true">!</span> as of {ago(asOf)}</p>
	{/if}
</div>
