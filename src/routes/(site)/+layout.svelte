<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Header, Footer, navCurrent } from '$lib/ds';
	import { SvelteToast } from '@zerodevx/svelte-toast';

	let { children }: { children: Snippet } = $props();
	const options = {};
</script>

{#if page.data?.chrome === 'hero'}
	<div class="absolute inset-x-0 top-0 z-10">
		<Header
			variant="hero"
			current={navCurrent(page.url.pathname)}
			epoch={page.data.headline?.state === 'ready' ? page.data.headline.value.epoch : undefined}
		/>
	</div>
{:else}
	<Header variant="bar" current={navCurrent(page.url.pathname)} />
{/if}
<main id="main" tabindex="-1" class="bg-canvas min-h-screen">
	{@render children()}
</main>
<Footer />
<SvelteToast {options} />
