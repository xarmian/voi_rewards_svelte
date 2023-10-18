<script lang="ts">
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
	<!--<Footer footerType="logo">
		<div class="sm:flex sm:items-center sm:justify-between">
		  <FooterBrand href="https://flowbite.com" src="/images/flowbite-svelte-icon-logo.svg" alt="Flowbite Logo" name="Flowbite" />
		  <FooterLinkGroup ulClass="flex flex-wrap items-center mb-6 text-sm text-gray-500 sm:mb-0 dark:text-gray-400">
			<FooterLink href="/">About</FooterLink>
			<FooterLink href="/">Voi Discord</FooterLink>
			<FooterLink href="/">Contact</FooterLink>
		  </FooterLinkGroup>
		</div>
		<hr class="my-6 border-gray-200 sm:mx-auto dark:border-gray-700 lg:my-8" />
	 </Footer>-->
</div>
