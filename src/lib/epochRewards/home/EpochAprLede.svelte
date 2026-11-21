<script lang="ts">
	import { headlineValues } from '../headline';
	import type { EpochHomeData } from '../home.server';
	let { epoch }: { epoch: EpochHomeData } = $props();
	let figures = $derived(
		headlineValues(epoch.headline.state === 'error' ? undefined : epoch.headline.value)
	);
</script>

{#if epoch.headline.state === 'ready'}Staking currently earns <strong>{figures.apr} APR</strong
	>.{/if}
