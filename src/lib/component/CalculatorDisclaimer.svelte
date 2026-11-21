<script lang="ts">
	import { voiPrice } from '$lib/stores/price';

	// The calculator's caveats: worded for the epoch estimate when it shows, else for the
	// real-time block rewards estimate.
	let { wording }: { wording: 'epoch' | 'block' } = $props();
</script>

<div
	class="space-y-2 rounded-card border border-line bg-surface-2 p-card text-label text-ink-muted"
>
	{#if wording === 'epoch'}
		<p>* Calculations assume current network conditions and weekly compounding of rewards.</p>
		<p>* Actual rewards and rates may vary based on network participation and other factors.</p>
	{:else}
		<p>* Calculations assume current network conditions.</p>
		<p>* Actual rewards may vary based on network participation and other factors.</p>
	{/if}
	<p>* This tool is for entertainment purposes only. It is not financial advice.</p>
	<p>
		{#if $voiPrice.lastUpdated}Data as of {$voiPrice.lastUpdated.toLocaleString('en-US', {
				timeZone: 'UTC',
				timeZoneName: 'short'
			})} (market price).{:else}Market price timestamp unavailable.{/if}
	</p>
</div>
