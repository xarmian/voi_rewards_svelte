<script lang="ts">
	import CalculatorComponent from '$lib/component/CalculatorComponent.svelte';
</script>

<div class="container-page space-y-8 py-8 text-ink md:py-12">
	<header class="max-w-3xl">
		<a href="/how_to_node" class="text-label text-accent underline underline-offset-4"
			>← Run a node</a
		>
		<h1 class="mt-4 text-display">Calculator</h1>
		<p class="mt-4 text-body text-ink-muted">
			Estimate your node rewards and costs at your chosen stake and VOI price.
		</p>
	</header>
	<CalculatorComponent />
</div>
