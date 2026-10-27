<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Header, Footer, navCurrent } from '$lib/ds';
	import { SvelteToast } from '@zerodevx/svelte-toast';

	let { children }: { children: Snippet } = $props();
	const options = {};
</script>

<Header variant="bar" current={navCurrent(page.url.pathname)} />
<main id="main" tabindex="-1" class="bg-canvas min-h-screen">
	{@render children()}
</main>
<Footer />
<SvelteToast {options} />
