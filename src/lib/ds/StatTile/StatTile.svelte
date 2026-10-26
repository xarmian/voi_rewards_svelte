<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ago, MISSING, pct } from '../format';
	import type { DataState } from '../types';
	import { slug } from '../slug';
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import Sparkline from '../Sparkline/Sparkline.svelte';
	import StatusPill from '../StatusPill/StatusPill.svelte';
	let {
		label,
		id,
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
		/** For linked tiles, keep labels unique on a page or supply an explicit description ID. */
		id?: string;
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
	let changePercent = $derived(
		change && Number.isFinite(change.value) ? pct(Math.abs(change.value)) : undefined
	);
	let changeDirection = $derived(changePercent === pct(0) ? 0 : (change?.value ?? 0) > 0 ? 1 : -1);
	let descriptionId = $derived(`${id ?? `ds-stat-${slug(label)}`}-desc`);
	let describedBy = $derived(
		[
			hasValue && detail ? `${descriptionId}-detail` : undefined,
			hasValue && changePercent ? `${descriptionId}-change` : undefined,
			hasValue && progress ? `${descriptionId}-progress` : undefined,
			state === 'stale' ? `${descriptionId}-stale` : undefined
		]
			.filter(Boolean)
			.join(' ') || undefined
	);
</script>

<svelte:element
	this={linked ? 'a' : 'div'}
	href={linked ? href : undefined}
	aria-label={linked
		? hasValue
			? `${label}: ${shownValue} ${unit ?? ''}`.trim()
			: `${label}: no data`
		: undefined}
	aria-describedby={linked ? describedBy : undefined}
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
			{#if detail}<div
					id={linked ? `${descriptionId}-detail` : undefined}
					class="mt-2 text-label text-ink-muted"
				>
					{#if typeof detail === 'string'}{detail}{:else}{@render detail()}{/if}
				</div>{/if}
			{#if change && changePercent}<div
					id={linked ? `${descriptionId}-change` : undefined}
					class="mt-2"
				>
					<StatusPill
						tone={changeDirection === 0 ? 'neutral' : changeDirection > 0 ? 'ok' : 'danger'}
						label="{changeDirection === 0
							? 'unchanged'
							: changeDirection > 0
								? 'up'
								: 'down'} {changePercent} {change.label}"
						visualLabel="{changeDirection === 0
							? ''
							: changeDirection > 0
								? '+'
								: '−'}{changePercent} {change.label}"
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
				</div>
				{#if linked}<span id={`${descriptionId}-progress`} class="sr-only"
						>{progress.label}: {progressValue} of {progressMax}</span
					>{/if}{/if}
		{/if}
		{#if state === 'stale'}<p
				id={linked ? `${descriptionId}-stale` : undefined}
				class="mt-2 text-label text-warn"
			>
				<span aria-hidden="true">!</span> as of {ago(asOf)}
			</p>{/if}
	{/if}
</svelte:element>
