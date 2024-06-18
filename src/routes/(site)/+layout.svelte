<script lang="ts">
	import { Footer, FooterBrand, FooterLinkGroup, FooterLink } from 'flowbite-svelte';
	import Navbar from './Navbar.svelte';
	import { SvelteToast } from '@zerodevx/svelte-toast';

	const options = {
  	}
	//import { Footer, FooterCopyright, FooterLinkGroup, FooterBrand, FooterLink } from 'flowbite-svelte';
</script>

<div class="app dark:text-white">
	<Navbar />

	<main>
		<slot />
	</main>
	<SvelteToast {options} />
	<Footer footerType="logo">
		<div class="sm:flex sm:items-center sm:justify-between">
		  <FooterLinkGroup ulClass="flex flex-wrap items-center mb-6 text-sm text-gray-500 sm:mb-0 dark:text-gray-400">
			<FooterLink href="/what_is_voi">What is Voi?</FooterLink>
			<FooterLink href="/how_to_node">Run a Node</FooterLink>
			<FooterLink href="/phase1">Phase 1</FooterLink>
			<FooterLink href="/quests">Quests</FooterLink>
			<FooterLink href="/about">About</FooterLink>
		  </FooterLinkGroup>
		  <FooterLinkGroup ulClass="flex flex-wrap items-center mb-6 text-sm text-gray-500 sm:mb-0 dark:text-gray-400">
			<FooterLink href="https://twitter.com/xarmian" target="_blank">My Twitter</FooterLink>
			<FooterLink href="https://twitter.com/Voi_Net" target="_blank">Voi Twitter</FooterLink>
			<FooterLink href="https://discord.gg/voi-network" target="_blank">Voi Discord</FooterLink>
			<FooterLink href="https://github.com/xarmian/voi_rewards_svelte" target="_blank">Source Code</FooterLink>
		  </FooterLinkGroup>
		</div>
		<hr class="my-6 border-gray-200 sm:mx-auto dark:border-gray-700 lg:my-8" />
	 </Footer>
</div>
