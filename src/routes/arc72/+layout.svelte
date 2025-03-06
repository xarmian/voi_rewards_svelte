<script lang="ts">
	import { SvelteToast } from '@zerodevx/svelte-toast';
	import WalletSearch from '$lib/component/WalletSearch.svelte';
	import { goto } from '$app/navigation';
	import { DarkMode } from 'flowbite-svelte';
	import Icon from '$lib/assets/android-chrome-192x192.png';

    const onSearch = (addr: string) => {
        goto(`/arc72/portfolio/${addr}`);
    }

	const options = {
  	}
	//import { Footer, FooterCopyright, FooterLinkGroup, FooterBrand, FooterLink } from 'flowbite-svelte';
</script>

<div class="app dark:text-white">
    <header class="bg-gray-100 dark:bg-gray-800 py-4 px-8 flex">
		<img src="{Icon}" class="mr-3 h-12 rounded-2xl" alt="Logo" />
		<div on:click={() => goto('/arc72')} class="cursor-pointer text-2xl font-bold content-center hide-on-mobile">NFT Navigator</div>
        <div class="flex-grow content-center">
            <WalletSearch onSubmit={onSearch} loadPreviousValue={false}/>
        </div>
		<DarkMode />
    </header>
	<main>
		<slot />
	</main>
	<SvelteToast {options} />
<!--	<Footer footerType="logo">
		<div class="sm:flex sm:items-center sm:justify-between">
		  <FooterLinkGroup ulClass="flex flex-wrap items-center mb-6 text-sm text-gray-500 sm:mb-0 dark:text-gray-400">
			<FooterLink href="/what_is_voi">What is Voi?</FooterLink>
			<FooterLink href="/how_to_node">How to Node?</FooterLink>
			<FooterLink href="/about">About</FooterLink>
		  </FooterLinkGroup>
		  <FooterLinkGroup ulClass="flex flex-wrap items-center mb-6 text-sm text-gray-500 sm:mb-0 dark:text-gray-400">
			<FooterLink href="https://twitter.com/xarmian" target="_blank">My Twitter</FooterLink>
			<FooterLink href="https://twitter.com/Voi_Net" target="_blank">Voi Twitter</FooterLink>
			<FooterLink href="https://discord.gg/vnFbrJrHeW" target="_blank">Voi Discord</FooterLink>
			<FooterLink href="https://github.com/xarmian/voi_rewards_svelte" target="_blank">Source Code</FooterLink>
		  </FooterLinkGroup>
		</div>
		<hr class="my-6 border-gray-200 sm:mx-auto dark:border-gray-700 lg:my-8" />
	 </Footer>-->
</div>
<style>
    @media (max-width: 600px) {
        .hide-on-mobile {
            display: none;
        }
    }
</style>