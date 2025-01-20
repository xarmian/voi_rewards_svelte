<script lang="ts">
  	import EcosystemFooter from './EcosystemFooter.svelte';
	import { Footer, FooterBrand, FooterLinkGroup, FooterLink } from 'flowbite-svelte';
	import Navbar from './Navbar.svelte';
	import { SvelteToast } from '@zerodevx/svelte-toast';
	import { goto } from '$app/navigation';

	let showNotice = false;

	const options = {
  	}
</script>

<div class="dark:text-white relative overflow-hidden">
	<div class="starfield fixed inset-0">
		<div class="stars-1"></div>
		<div class="stars-1 stars-1-delayed"></div>
		<div class="stars-2"></div>
		<div class="stars-2 stars-2-delayed"></div>
		<div class="stars-3"></div>
		<div class="stars-3 stars-3-delayed"></div>
	</div>
	<div class="gradient-overlay"></div>
	<div class="relative z-[100]">
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
				<button class="place-self-end self-center ml-4" on:click={() => showNotice = false} aria-label="Close Notice">
					<i class="fas fa-times fa-2x"></i>
				</button>
			</div>
		{/if}
		<main class="min-h-screen py-8 px-0 sm:px-6 lg:px-8 relative">
			<div class="relative">
				<slot />
			</div>
		</main>
		<SvelteToast {options} />
		<Footer footerType="socialmedia">
			<EcosystemFooter></EcosystemFooter>
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
</div>

<style>
	@keyframes backgroundShift {
		0% {
			background-position: 50% 100%;
		}
		50% {
			background-position: 50% 0%;
		}
		100% {
			background-position: 50% 100%;
		}
	}

	.gradient-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(to bottom right, #ff00ff, #00ff00, #00ffff);
		background-size: 400% 400%;
		animation: backgroundShift 20s ease infinite;
		opacity: 0.3;
		z-index: 1;
		pointer-events: none;
	}

	.starfield {
		z-index: 0;
		perspective: 1000px;
		overflow: hidden;
		pointer-events: none;
		background: black;
	}

	@keyframes stars-move {
		0% {
			transform: scale(0.1) translateZ(-500px);
			opacity: 0;
		}
		50% {
			opacity: 1;
		}
		100% {
			transform: scale(2) translateZ(500px);
			opacity: 0;
		}
	}

	.stars-1, .stars-2, .stars-3 {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		transform-origin: center;
	}

	.stars-1 {
		background-image: radial-gradient(1px 1px at 50% 50%, white, rgba(0,0,0,0)),
						 radial-gradient(1px 1px at 25% 25%, white, rgba(0,0,0,0)),
						 radial-gradient(1px 1px at 75% 75%, white, rgba(0,0,0,0));
		background-size: 100px 100px;
		animation: stars-move 6s linear infinite;
	}

	.stars-1-delayed {
		animation-delay: -3s;
	}

	.stars-2 {
		background-image: radial-gradient(2px 2px at 20% 50%, #00ff00, rgba(0,0,0,0)),
						 radial-gradient(2px 2px at 40% 70%, #00ffff, rgba(0,0,0,0)),
						 radial-gradient(2px 2px at 60% 30%, #ff00ff, rgba(0,0,0,0));
		background-size: 200px 200px;
		animation: stars-move 8s linear infinite;
	}

	.stars-2-delayed {
		animation-delay: -4s;
	}

	.stars-3 {
		background-image: radial-gradient(3px 3px at 15% 15%, white, rgba(0,0,0,0)),
						 radial-gradient(3px 3px at 85% 85%, white, rgba(0,0,0,0));
		background-size: 300px 300px;
		animation: stars-move 10s linear infinite;
	}

	.stars-3-delayed {
		animation-delay: -5s;
	}
</style>