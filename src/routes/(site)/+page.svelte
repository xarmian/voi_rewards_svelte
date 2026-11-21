<script lang="ts">
	import { epochHomeData } from '$lib/epochRewards';
	import { HomeRewards } from '$lib/epochRewards/components';
	import HomeBlockRewards from './HomeBlockRewards.svelte';
	import LatestBlocks from './LatestBlocks.svelte';
	import RunNodeCard from './RunNodeCard.svelte';
	import MarketsCard from './MarketsCard.svelte';
	import HomeTop from './HomeTop.svelte';
	import type { HomeData } from '$lib/server/home';
	let { data }: { data: HomeData } = $props();
	let epoch = $derived(epochHomeData(data));
	let flow = $derived(epoch ? 'flex flex-col' : 'grid md:grid-cols-2');
</script>

<HomeTop {data} />
<div class="container-page grid gap-bento lg:grid-cols-12 md:grid-cols-2 mt-bento pb-8">
	{#if epoch}
		<HomeRewards
			initial={epoch.rewards}
			currentEpoch={epoch.currentEpoch}
			initialEpoch={epoch.rewardsEpoch}
			price={data.price}
		/>
	{/if}
	<!-- Without the rewards table, the side cards take the full width in two columns. -->
	<div class="min-w-0 {epoch ? 'lg:col-span-4' : 'lg:col-span-12'} md:col-span-2 {flow} gap-bento">
		<HomeBlockRewards />
		<LatestBlocks />
		<RunNodeCard />
		<MarketsCard markets={data.markets} />
	</div>
</div>
