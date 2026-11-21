<script lang="ts">
	import { Button } from '$lib/ds/Button';
	import { validateNodeCost } from './view';

	// The calculator's "Monthly node cost" field, moved here unchanged; only the epoch estimate uses it.
	let { cost = $bindable() }: { cost: number | undefined } = $props();
	let nodeCostError = $derived(validateNodeCost(cost));
</script>

<div>
	<label for="monthly-node-cost" class="mb-2 block text-label text-ink-muted"
		>Monthly node cost (USD)</label
	>
	<div class="flex min-w-0 items-center gap-2">
		<Button
			variant="soft"
			aria-label="Decrease monthly node cost"
			onclick={() => (cost = Math.max(0, Number(cost || 0) - 1))}>−</Button
		>
		<input
			id="monthly-node-cost"
			type="number"
			min="0"
			step="1"
			bind:value={cost}
			aria-invalid={Boolean(nodeCostError)}
			aria-describedby={nodeCostError ? 'node-cost-error' : undefined}
			class="block w-full min-w-0 rounded-ds-sm border border-edge bg-surface px-3 py-2 text-ink flex-1"
		/>
		<Button
			variant="soft"
			aria-label="Increase monthly node cost"
			onclick={() => (cost = Number(cost || 0) + 1)}>+</Button
		>
	</div>
	{#if nodeCostError}<p id="node-cost-error" role="alert" class="mt-2 text-label text-danger">
			{nodeCostError}
		</p>{/if}
</div>
