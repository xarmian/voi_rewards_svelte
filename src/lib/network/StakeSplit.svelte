<script lang="ts">
	import Card from '$lib/ds/Card/Card.svelte';
	import InlineAlert from '$lib/ds/InlineAlert/InlineAlert.svelte';
	import { comma as num } from '$lib/ds/format';
	import { freshnessText, type EpochResource } from './series';
	let {
		resource,
		loading,
		onretry
	}: { resource: EpochResource | null; loading: boolean; onretry: () => void } = $props();
	const split = $derived(resource?.current?.split);
	const splitRows = $derived(
		split
			? [
					{ label: 'Community', value: split.community },
					{ label: 'Ballast / Block Authority', value: split.ballast },
					{ label: 'Eligible (overlapping subset)', value: split.eligible },
					{ label: 'Online total', value: split.online }
				]
			: []
	);
	const voi = (value: number) => `${num(value, 2)} VOI`;
</script>

<Card title="Current stake split" id="network-current-split">
	<p class="mb-3 text-sm text-ink-muted">
		Current epoch stake in VOI. Community stake is online stake minus ballast.
	</p>
	<div aria-busy={loading ? 'true' : undefined} class="min-h-[230px]">
		{#if loading}
			<div class="h-[230px] rounded-ds-xs bg-grid">
				<span class="sr-only">Loading current stake split…</span>
			</div>
		{:else if resource?.status === 'error'}
			<InlineAlert message="Couldn't load Current stake split." {onretry} />
		{:else if resource?.status === 'empty'}
			<p class="text-sm text-ink-muted">No observations in this range</p>
		{:else if !split}
			<InlineAlert
				tone="warn"
				message="Unavailable: current stake totals are missing or inconsistent."
				{onretry}
			/>
		{:else}
			<div
				role="img"
				aria-label={`Online stake: ${voi(split.online)}. Community: ${voi(split.community)}. Ballast / Block Authority: ${voi(split.ballast)}.`}
			>
				<div class="flex h-11 overflow-hidden rounded-ds-sm border border-edge" aria-hidden="true">
					<div
						class="bg-accent-fill"
						style:width={`${(split.community / split.online) * 100}%`}
					></div>
					<div class="bg-hi" style:width={`${(split.ballast / split.online) * 100}%`}></div>
				</div>
			</div>
			<dl class="my-4 grid gap-3 text-sm sm:grid-cols-2">
				<div>
					<dt>
						<span aria-hidden="true" class="mr-1 inline-block h-2 w-2 bg-accent-fill"
						></span>Community
					</dt>
					<dd class="num font-bold">{voi(split.community)}</dd>
				</div>
				<div>
					<dt>
						<span aria-hidden="true" class="mr-1 inline-block h-2 w-2 bg-hi"></span>Ballast / Block
						Authority
					</dt>
					<dd class="num font-bold">{voi(split.ballast)}</dd>
				</div>
			</dl>
			<p class="text-sm text-ink-muted">
				Eligible stake: <span class="num text-ink">{voi(split.eligible)}</span>. This is the subset
				eligible for rewards; it overlaps the online total and is not an additional segment of the
				bar.
			</p>
			<details class="mt-3 text-sm">
				<summary class="w-fit cursor-pointer text-accent">View data</summary>
				<table class="mt-2 w-full table-fixed break-words text-sm">
					<caption class="mb-2 text-start text-label text-ink-muted"
						>Current epoch {resource?.current?.epoch} stake in VOI.</caption
					>
					<thead
						><tr
							><th scope="col" class="border-b border-line p-2 text-start">Category</th><th
								scope="col"
								class="border-b border-line p-2 text-end">VOI</th
							></tr
						></thead
					>
					<tbody
						>{#each splitRows as row}<tr
								><th scope="row" class="border-b border-line p-2 text-start font-normal"
									>{row.label}</th
								><td class="num border-b border-line p-2 text-end">{num(row.value, 2)}</td></tr
							>{/each}</tbody
					>
				</table>
			</details>
		{/if}
	</div>
	{#if resource?.status === 'stale'}
		<InlineAlert tone="warn" message={`Stale - ${freshnessText(resource)}`} {onretry} />
	{:else if resource?.receivedAt !== null && resource}
		<p class="mt-2 text-label text-ink-muted">{freshnessText(resource)}</p>
	{/if}
</Card>
