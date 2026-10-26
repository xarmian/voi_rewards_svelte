<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ago, MISSING, pct } from '../format';
	import type { DataState } from '../types';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import Sparkline from '../Sparkline/Sparkline.svelte';
	import StatusPill from '../StatusPill/StatusPill.svelte';
	let {
		label,
		icon,
		value,
		unit,
		detail,
		change,
		trend,
		progress,
		href,
		state = 'ready',
		onretry,
		asOf
	}: {
		label: string;
		icon?: string;
		value: string;
		unit?: string;
		/** When href is supplied, detail snippets must contain only non-interactive content. */
		detail?: string | Snippet;
		change?: { value: number; label: string };
		trend?: number[];
		progress?: { value: number; max: number; label: string };
		href?: string;
		state?: DataState;
		onretry?: () => void;
		asOf?: Date | number | string;
	} = $props();
	let linked = $derived(Boolean(href) && state !== 'loading' && state !== 'error');
	let shownValue = $derived(state === 'empty' ? MISSING : value);
	let hasValue = $derived(shownValue !== MISSING);
	let progressMax = $derived(progress ? Math.max(0, progress.max) : 0);
	let progressValue = $derived(progress ? Math.min(progressMax, Math.max(0, progress.value)) : 0);
</script>

<svelte:element
	this={linked ? 'a' : 'div'}
	href={linked ? href : undefined}
	aria-label={linked ? `${label}: ${shownValue} ${unit ?? ''}`.trim() : undefined}
	aria-busy={state === 'loading' ? 'true' : undefined}
	class="block min-w-0 rounded-card border border-line bg-surface p-card text-ink shadow-card {linked
		? 'hover:ring-2 hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent'
		: ''}"
>
	<div class="mb-3 flex min-h-7 items-center gap-2 text-label text-ink-muted">
		{#if icon}<span
				aria-hidden="true"
				class="flex h-7 w-7 items-center justify-center rounded-ds-xs bg-accent-soft text-accent"
				>{icon}</span
			>{/if}{label}
	</div>
	{#if state === 'loading'}
		<span class="sr-only">Loading {label}…</span>
		<div aria-hidden="true" class="space-y-3">
			<div class="h-9 w-3/4 rounded-ds-xs bg-grid"></div>
			{#if detail || change}<div class="h-5 w-1/2 rounded-ds-xs bg-grid"></div>{/if}{#if trend}<div
					class="h-11 rounded-ds-xs bg-grid"
				></div>{:else if progress}<div class="h-2 rounded-full bg-grid"></div>{/if}
		</div>
	{:else if state === 'error'}
		<InlineAlert message="Unable to load {label}." {onretry} />
	{:else}
		<p class="num break-words text-stat">
			{shownValue}{#if unit}<span class="ml-1 text-label text-ink-muted">{unit}</span>{/if}
		</p>
		{#if hasValue}
			{#if detail}<div class="mt-2 text-label text-ink-muted">
					{#if typeof detail === 'string'}{detail}{:else}{@render detail()}{/if}
				</div>{/if}
			{#if change}<div class="mt-2">
					<StatusPill
						tone={change.value >= 0 ? 'ok' : 'danger'}
						label="{change.value >= 0 ? 'up' : 'down'} {pct(Math.abs(change.value))} {change.label}"
						visualLabel="{change.value >= 0 ? '+' : '−'}{pct(
							Math.abs(change.value)
						)} {change.label}"
					/>
				</div>{/if}
			{#if trend}<div class="mt-3"><Sparkline values={trend} {label} /></div>{/if}
			{#if progress}<div
					class="mt-3 h-2 rounded-full bg-grid"
					role="progressbar"
					aria-valuenow={progressValue}
					aria-valuemin="0"
					aria-valuemax={progressMax}
					aria-label={progress.label}
				>
					<div
						class="h-full rounded-full bg-bar"
						style:width={`${progressMax > 0 ? (progressValue / progressMax) * 100 : 0}%`}
					></div>
				</div>{/if}
		{/if}
		{#if state === 'stale'}<p class="mt-2 text-label text-warn">
				<span aria-hidden="true">!</span> as of {ago(asOf)}
			</p>{/if}
	{/if}
</svelte:element>
