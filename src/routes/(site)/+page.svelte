<script lang="ts">
	import HomeRewards from './HomeRewards.svelte';
	import LatestBlocks from './LatestBlocks.svelte';
	import RunNodeCard from './RunNodeCard.svelte';
	import MarketsCard from './MarketsCard.svelte';
	import { InlineAlert } from '$lib/ds';
	import HomeTop from './HomeTop.svelte';
	import type { HomeData } from '$lib/server/home';
	let { data }: { data: HomeData } = $props();
</script>

{#if data.page === 'quests'}
	{#await import('./quests/QuestsPage.svelte')}
		<p class="container-page py-8 text-sm text-ink-muted" role="status">Loading quests…</p>
	{:then module}
		<module.default />
	{:catch}
		<InlineAlert message="Unable to load quests." onretry={() => window.location.reload()} />
	{/await}
{:else}
	<HomeTop {data} />
	<div class="container-page grid gap-bento lg:grid-cols-12 md:grid-cols-2 mt-bento pb-8">
		<HomeRewards
			initial={data.rewards}
			currentEpoch={data.currentEpoch}
			initialEpoch={data.rewardsEpoch}
			price={data.price}
		/>
		<div class="min-w-0 lg:col-span-4 md:col-span-2 flex flex-col gap-bento">
			<LatestBlocks />
			<RunNodeCard />
			<MarketsCard markets={data.markets} />
		</div>
	</div>
{/if}
