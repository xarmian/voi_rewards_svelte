<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { SearchBox, StatTile } from '$lib/ds';
	import { comma, MISSING } from '$lib/ds/format';
	import { epochHomeData } from '$lib/epochRewards';
	import { EpochAprLede, HomeEpochHeadline, HomeEpochTiles } from '$lib/epochRewards/components';
	import { onlineStakeTile, priceTile } from '$lib/home/headline';
	import type { DashboardData } from '$lib/server/home';
	let { data }: { data: DashboardData } = $props();
	const retry = () => {
		void invalidateAll();
	};
	let epoch = $derived(epochHomeData(data));
	// Without the epoch tiles, the three remaining tiles share the row.
	let tileSpan = $derived(epoch ? 'lg:col-span-3' : 'lg:col-span-4');
</script>

<div
	class="on-hero bg-hero text-on-hero rounded-b-hero pt-[132px] pb-[70px] md:pb-[84px] lg:pt-[120px]"
>
	<div class="container-page text-center">
		<h1 class="mx-auto max-w-3xl text-display">Check your Voi node's rewards in seconds</h1>
		<p class="mx-auto mt-4 max-w-2xl text-lede text-on-hero-muted">
			Status, key expiry, blocks and estimated rewards for any account or staking contract.
			{#if epoch}<EpochAprLede {epoch} />{/if}
		</p>
		<div class="relative mx-auto mt-6 max-w-2xl text-start">
			<SearchBox
				variant="hero"
				tone="hero"
				onsubmit={(address) => {
					void goto('/wallet/' + address);
				}}
			/>
		</div>
	</div>
</div>

<div class="container-page relative -mt-[60px] grid gap-bento md:grid-cols-2 lg:grid-cols-12">
	{#if epoch}<HomeEpochHeadline {epoch} onretry={retry} />{/if}
	<div class="grid min-w-0 md:col-span-1 {tileSpan}">
		{#await data.onlineStake}
			<StatTile
				label="Online stake"
				icon="ϟ"
				{...onlineStakeTile(epoch?.currentStake)}
				onretry={retry}
			/>
		{:then stake}
			<StatTile
				label="Online stake"
				icon="ϟ"
				{...onlineStakeTile(epoch?.currentStake, stake)}
				onretry={retry}
			/>
		{/await}
	</div>
	{#if epoch}<HomeEpochTiles {epoch} onlineCount={data.onlineCount} onretry={retry} />{:else}
		<div class="grid min-w-0 md:col-span-1 {tileSpan}">
			{#await data.onlineCount}
				<StatTile label="Online accounts" icon="♙" value={MISSING} state="loading" />
			{:then count}
				<StatTile
					label="Online accounts"
					icon="♙"
					value={count.state === 'error' ? MISSING : comma(count.value)}
					detail="Accounts online now"
					href="/analytics"
					state={count.state}
					onretry={retry}
					asOf={count.state === 'stale' ? count.asOf : undefined}
				/>
			{/await}
		</div>
	{/if}
	<div class="grid min-w-0 md:col-span-1 {tileSpan}">
		{#await data.price}
			<StatTile label="VOI price" icon="$" value={MISSING} state="loading" />
		{:then price}
			<StatTile label="VOI price" icon="$" {...priceTile(price)} onretry={retry} />
		{/await}
	</div>
</div>
