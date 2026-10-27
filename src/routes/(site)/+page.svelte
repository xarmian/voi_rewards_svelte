<script lang="ts">
	import Dashboard from './Dashboard.svelte';
	import QuestsPage from './quests/QuestsPage.svelte';
	import HomeTop from './HomeTop.svelte';
	import type { HomeData } from '$lib/server/home';
	let { data }: { data: HomeData } = $props();
</script>

{#if data.page === 'quests'}
	<QuestsPage />
{:else}
	<HomeTop {data} />
	<Dashboard initial={data.rewards} />
{/if}
