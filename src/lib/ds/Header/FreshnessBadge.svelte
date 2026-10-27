<script lang="ts">
	import { onMount } from 'svelte';
	import { chainStatus, freshness } from '$lib/stores/chainStatus';
	import { epochAt } from '$lib/epochs';
	import { comma } from '../format';
	let { variant, epoch }: { variant: 'hero' | 'bar'; epoch?: number } = $props();
	let clientEpoch: number | undefined = $state();
	onMount(() => {
		clientEpoch = epochAt(new Date());
	});
	const status = $derived(
		freshness($chainStatus, $chainStatus.checkedAt ?? $chainStatus.startedAt ?? 0)
	);
	const announcement = $derived(
		status.tone === 'ok'
			? 'Chain data is live'
			: status.tone === 'warn'
				? 'Chain data is stale'
				: ''
	);
	// TASK-65: recalculate age only on poll completion, including failed polls.
	const seconds = $derived(
		$chainStatus.lastRoundAt === null || $chainStatus.checkedAt === null
			? null
			: Math.round(($chainStatus.checkedAt - $chainStatus.lastRoundAt) / 1000)
	);
</script>

<p class="text-micro bg-on-hero-surface rounded-full px-2.5 py-1 text-on-hero">
	<span
		aria-hidden="true"
		class="inline-flex h-4 w-4 items-center justify-center rounded-full {status.tone === 'ok'
			? 'bg-ok-soft text-ok'
			: status.tone === 'warn'
				? 'bg-warn-soft text-warn'
				: 'text-on-hero-muted'}">{status.tone === 'warn' ? '!' : '●'}</span
	>
	{#if status.unavailable}chain data unavailable{:else if status.tone === 'warn'}data {comma(
			status.minutesOld
		)} min old{:else if $chainStatus.round === null}Checking chain…{:else if variant === 'hero'}Epoch
		{epoch ?? clientEpoch} live · block {comma($chainStatus.round)}{:else}#{comma(
			$chainStatus.round
		)} · {comma(seconds)} s{/if}
</p>
<span class="sr-only" role="status">{announcement}</span>
