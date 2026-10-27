<script lang="ts">
	import { onMount } from 'svelte';
	import { epochUrl, readEpoch } from './url';
	let {
		epoch = $bindable(),
		min,
		max,
		rangeLabel,
		jump = true,
		syncUrl = false,
		id = 'ds-epoch-stepper'
	}: {
		epoch: number;
		min: number;
		max: number;
		rangeLabel: (epoch: number) => string;
		jump?: boolean;
		syncUrl?: boolean;
		/** Pass a unique id when rendering multiple steppers on a page. */
		id?: string;
	} = $props();
	let announcement = $state('');
	let epochs = $derived(Array.from({ length: max - min + 1 }, (_, i) => max - i));
	onMount(() => {
		if (syncUrl) epoch = readEpoch(new URL(window.location.href), min, max);
	});
	async function change(next: number) {
		if (next < min || next > max || next === epoch) return;
		epoch = next;
		announcement = `Epoch ${epoch}, ${rangeLabel(epoch)}`;
		if (syncUrl) {
			// Browser-only dynamic imports keep the public barrel usable in node SSR tests.
			const [{ replaceState }, { page }] = await Promise.all([
				import('$app/navigation'),
				import('$app/state')
			]);
			replaceState(epochUrl(new URL(window.location.href), epoch, max), page.state);
		}
	}
</script>

<div
	{id}
	role="group"
	aria-label="Epoch"
	class="flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-full border border-edge bg-surface-2 p-1 text-sm text-ink"
>
	<button
		type="button"
		aria-label={epoch <= min ? 'Previous epoch' : `Previous epoch, ${epoch - 1}`}
		disabled={epoch <= min}
		onclick={() => change(epoch - 1)}
		class="min-h-10 rounded-full px-3 text-accent disabled:opacity-50"
	>
		<span aria-hidden="true">‹</span>{#if epoch > min}
			{epoch - 1}{/if}
	</button>
	<span class="num rounded-full bg-surface px-3 py-2 font-bold shadow-card">Epoch {epoch}</span>
	<button
		type="button"
		aria-label={epoch >= max ? 'Next epoch' : `Next epoch, ${epoch + 1}`}
		disabled={epoch >= max}
		onclick={() => change(epoch + 1)}
		class="min-h-10 rounded-full px-3 text-accent disabled:opacity-50"
	>
		{#if epoch < max}{epoch + 1}
		{/if}<span aria-hidden="true">›</span>
	</button>
	{#if jump}
		<select
			aria-label="Jump to epoch"
			value={epoch}
			onchange={(event) => change(Number(event.currentTarget.value))}
			class="min-h-10 min-w-0 max-w-full rounded-full border border-edge bg-surface px-3 text-sm text-ink"
		>
			{#each epochs as n (n)}<option value={n} selected={n === epoch}
					>Epoch {n}: {rangeLabel(n)}</option
				>{/each}
		</select>
	{/if}
</div>
<p class="sr-only" aria-live="polite">{announcement}</p>
