<script lang="ts">
	import { Footer, FooterBrand, FooterLinkGroup, FooterLink } from 'flowbite-svelte';
	import Navbar from './Navbar.svelte';
	import { SvelteToast } from '@zerodevx/svelte-toast';
	import { goto } from '$app/navigation';

	export let data;

	let showNotice = true;
	if (data.session?.user) showNotice = false;

	const options = {
  	}
	//import { Footer, FooterCopyright, FooterLinkGroup, FooterBrand, FooterLink } from 'flowbite-svelte';
</script>

<div class="dark:text-white bg-[#662ed9]">
	<Navbar />
	{#if showNotice}
		<div class="flex flex-row bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 w-full justify-between" role="alert">
			<div class="flex flex-row">
				<div class="flex flex-col">
					<p class="font-bold">Notice!</p>
					<p>
						Get ready for Voi MainNet! Register your Discord account and wallet addresses now! Deadline: September 16, 2024
						<a href="https://medium.com/@voifoundation/mainnet-announcement-f05de7f2bab1" target="_blank" class="text-blue-500 underline hover:text-blue-400">(More Info)</a>
					</p>
				</div>
				<i class="fas fa-arrow-right place-self-center mx-5 fa-2x"></i>
				<button class="place-self-center bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded" on:click={() => goto('/accounts')}>Link Accounts</button>
			</div>
			<button class="place-self-end self-center ml-4" on:click={() => showNotice = false}>
				<i class="fas fa-times fa-2x"></i>
			</button>
		</div>
	{/if}
	<main>
		<slot />
	</main>
	<SvelteToast {options} />
	<Footer footerType="socialmedia">
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
