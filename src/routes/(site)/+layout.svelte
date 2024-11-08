<script lang="ts">
	import { Footer, FooterBrand, FooterLinkGroup, FooterLink } from 'flowbite-svelte';
	import Navbar from './Navbar.svelte';
	import { SvelteToast } from '@zerodevx/svelte-toast';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fetchProjects } from './phase2/[...slug]/projects';
	import type { IProject } from '$lib/data/types';

	let projects: IProject[] = [];

	onMount(async () => {
		projects = await fetchProjects();
		projects = projects.filter(p => p.status === 'active');
	});

	//export let data;

	let showNotice = false;
	onMount(() => {
		//if (!data.session?.user) showNotice = true;
	});

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
		<div class="w-full overflow-hidden mb-8">
			<p class="text-sm text-gray-500 dark:text-gray-400 font-semibold">Voi Ecosystem Projects</p>
			<div class="relative">
				<div class="flex overflow-x-auto space-x-2 py-4 px-2 scrollbar-hide">
					{#each projects as project}
						<a
							href={project.url}
							target="_blank"
							rel="noopener noreferrer"
							class="flex-shrink-0 group w-24"
						>
							<div class="w-24 h-24 rounded-lg bg-gray-200 dark:bg-gray-700 p-2 flex items-center justify-center border border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors">
								{#if project.logo}
									<img
										src={project.logo}
										alt={project.title}
										class="max-w-full max-h-full object-contain"
									/>
								{:else}
									<span class="text-sm text-center text-gray-600 dark:text-gray-300">
										{project.title}
									</span>
								{/if}
							</div>
							<p class="text-xs text-center mt-2 text-gray-500 dark:text-gray-400 group-hover:text-purple-500 break-words hyphens-auto">
								{project.title}
							</p>
						</a>
					{/each}
				</div>
			</div>
		</div>
		<div class="sm:flex sm:items-center sm:justify-between">
			<FooterLinkGroup ulClass="flex flex-wrap items-center mb-6 text-sm text-gray-500 sm:mb-0 dark:text-gray-400">
				<FooterLink href="/ecosystem">Ecosystem</FooterLink>
				<FooterLink href="/faq">FAQ</FooterLink>
				<FooterLink href="/what_is_voi">What is Voi?</FooterLink>
				<FooterLink href="/how_to_node">Run a Node</FooterLink>
				<FooterLink href="/wallet">Account</FooterLink>
				<!--<FooterLink href="/phase1">Phase 1</FooterLink>-->
				<!--<FooterLink href="/quests">Quests</FooterLink>-->
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

<style>
	/* Hide scrollbar but keep functionality */
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>
