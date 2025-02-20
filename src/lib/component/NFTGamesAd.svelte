<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';

	let countdown = { days: 0, hours: 0, minutes: 0, seconds: 0 };
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	const startDate = new Date('2025-02-14T17:00:00Z');
	const endDate = new Date('2025-02-28T17:00:00Z');
	const startTimestamp = startDate.getTime();
	const endTimestamp = endDate.getTime();

	$: now = new Date();
	$: nowTimestamp = now.getTime();
	$: isGameActive = nowTimestamp >= startTimestamp && nowTimestamp <= endTimestamp;
	$: isGamePending = nowTimestamp < startTimestamp;
	$: {
		// Clear interval if game is no longer pending
		if (!isGamePending && countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	}

	function updateCountdown() {
		const now = new Date();
		const nowTimestamp = now.getTime();
		const diff = startTimestamp - nowTimestamp;
		
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));
		const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
		const seconds = Math.floor((diff % (1000 * 60)) / 1000);
		
		countdown = { days, hours, minutes, seconds };
	}

	onMount(() => {
		if (isGamePending) {
			updateCountdown();
			countdownInterval = setInterval(updateCountdown, 1000);
		}
	});

	onDestroy(() => {
		if (countdownInterval) {
			clearInterval(countdownInterval);
		}
	});
</script>

<a 
	href="https://nftnavigator.xyz/nftgames"
	class="block w-full overflow-hidden bg-gradient-to-r from-blue-900 via-purple-900 to-blue-900 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-200 my-4"
>
	<div class="relative px-6 py-4 text-white">
		<div class="absolute inset-0 opacity-10"></div>
		
		<div class="relative flex flex-col sm:flex-row items-center justify-between gap-4">
			<div class="flex-1">
				<div in:fade={{ duration: 300 }} class="text-2xl sm:text-3xl font-bold mb-1">
					🎮 VOI NFT Winter Games 2025
				</div>
				<div class="text-blue-200 text-sm sm:text-base">
					{#if isGamePending}
						Coming soon to a wallet near you...
					{:else if isGameActive}
						Compete now!
					{:else}
						Games have ended
					{/if}
				</div>
			</div>

			{#if isGamePending}
				<div class="flex gap-3 text-yellow-300 font-mono">
					<div class="text-center">
						<div class="text-xl font-bold">{countdown.days}d</div>
					</div>
					<div class="text-xl font-bold">:</div>
					<div class="text-center">
						<div class="text-xl font-bold">{countdown.hours.toString().padStart(2, '0')}h</div>
					</div>
					<div class="text-xl font-bold">:</div>
					<div class="text-center">
						<div class="text-xl font-bold">{countdown.minutes.toString().padStart(2, '0')}m</div>
					</div>
					<div class="text-xl font-bold">:</div>
					<div class="text-center">
						<div class="text-xl font-bold">{countdown.seconds.toString().padStart(2, '0')}s</div>
					</div>
				</div>
			{:else if isGameActive}
				<div class="text-yellow-300 font-bold text-lg animate-pulse">
					🔥 Games are LIVE!
				</div>
			{:else}
				<div class="text-red-300 font-bold">
					Games have ended
				</div>
			{/if}

			<div class="hidden sm:block">
				<div class="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-full transform hover:scale-105 transition-all duration-200">
					{#if isGamePending}
						Learn More
					{:else if isGameActive}
						Join Now
					{:else}
						View Results
					{/if}
				</div>
			</div>
		</div>
	</div>
</a>

<style>
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
</style> 