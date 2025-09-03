<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { Badge } from 'flowbite-svelte';
	import type { UniqueToken } from '../../routes/api/tokens/+server';

	const dispatch = createEventDispatcher<{
		select: UniqueToken;
		favorite: UniqueToken;
		compare: UniqueToken;
		quickAction: { token: UniqueToken; action: string };
		swipeReveal: { token: UniqueToken; direction: 'left' | 'right' };
	}>();

	export let token: UniqueToken;
	export let analytics: any = null;
	export let selected = false;
	export let favorited = false;
	export let showQuickActions = true;
	export let compact = false;
	export let animated = true;

	interface TokenMetrics {
		price: number;
		priceChange24h: number;
		priceChange7d: number;
		volume24h: number;
		tvl: number;
		marketCap: number;
		uniqueTraders24h: number;
		swapCount24h: number;
	}

	let cardElement: HTMLDivElement;
	let touchStartX = 0;
	let touchStartY = 0;
	let currentX = 0;
	let isDragging = false;
	let swipeThreshold = 100;
	let swipeRevealed = false;
	let swipeDirection: 'left' | 'right' | null = null;
	let isPressed = false;
	let pressTimer: NodeJS.Timeout;
	let metrics: TokenMetrics = {
		price: 0,
		priceChange24h: 0,
		priceChange7d: 0,
		volume24h: 0,
		tvl: 0,
		marketCap: 0,
		uniqueTraders24h: 0,
		swapCount24h: 0
	};

	// Load analytics data
	$: if (analytics) {
		metrics = {
			price: Math.random() * 100, // Mock - replace with real price data
			priceChange24h: analytics.volume?.priceChange24h || (Math.random() * 20 - 10),
			priceChange7d: Math.random() * 30 - 15, // Mock - replace with real data
			volume24h: analytics.volume?.volume24h || 0,
			tvl: analytics.liquidity?.totalTvlUsd || 0,
			marketCap: (analytics.liquidity?.totalTvlUsd || 0) * 5, // Mock calculation
			uniqueTraders24h: analytics.volume?.uniqueTraders24h || 0,
			swapCount24h: analytics.volume?.swapCount24h || 0
		};
	}

	onMount(() => {
		if (cardElement) {
			// Passive touch listeners for better performance
			cardElement.addEventListener('touchstart', handleTouchStart, { passive: false });
			cardElement.addEventListener('touchmove', handleTouchMove, { passive: false });
			cardElement.addEventListener('touchend', handleTouchEnd, { passive: true });
		}
	});

	onDestroy(() => {
		if (cardElement) {
			cardElement.removeEventListener('touchstart', handleTouchStart);
			cardElement.removeEventListener('touchmove', handleTouchMove);
			cardElement.removeEventListener('touchend', handleTouchEnd);
		}
		if (pressTimer) clearTimeout(pressTimer);
	});

	function handleTouchStart(event: TouchEvent) {
		if (event.touches.length > 1) return; // Ignore multi-touch

		const touch = event.touches[0];
		touchStartX = touch.clientX;
		touchStartY = touch.clientY;
		currentX = 0;
		isDragging = false;
		isPressed = true;

		// Haptic feedback for press start (if supported)
		if (navigator.vibrate) {
			navigator.vibrate(10);
		}

		// Long press detection
		pressTimer = setTimeout(() => {
			if (isPressed && !isDragging) {
				handleLongPress();
			}
		}, 500);
	}

	function handleTouchMove(event: TouchEvent) {
		if (event.touches.length > 1) return;

		const touch = event.touches[0];
		const deltaX = touch.clientX - touchStartX;
		const deltaY = touch.clientY - touchStartY;

		// Determine if this is a horizontal swipe
		if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
			event.preventDefault(); // Prevent scrolling
			isDragging = true;
			currentX = deltaX;
			
			// Update card position
			if (cardElement) {
				cardElement.style.transform = `translateX(${Math.min(Math.max(deltaX, -150), 150)}px)`;
				cardElement.style.transition = 'none';
			}

			// Determine swipe direction
			if (Math.abs(deltaX) > swipeThreshold) {
				const newDirection = deltaX > 0 ? 'right' : 'left';
				if (swipeDirection !== newDirection) {
					swipeDirection = newDirection;
					// Haptic feedback for swipe threshold
					if (navigator.vibrate) {
						navigator.vibrate(20);
					}
				}
			}
		}

		// Clear long press if dragging
		if (isDragging && pressTimer) {
			clearTimeout(pressTimer);
		}
	}

	function handleTouchEnd(event: TouchEvent) {
		isPressed = false;
		if (pressTimer) clearTimeout(pressTimer);

		if (!isDragging) {
			// Simple tap
			handleTap();
			return;
		}

		// Handle swipe completion
		if (Math.abs(currentX) > swipeThreshold && swipeDirection) {
			// Swipe action completed
			swipeRevealed = true;
			dispatch('swipeReveal', { token, direction: swipeDirection });
			
			// Show swipe action briefly then reset
			setTimeout(() => {
				resetCardPosition();
			}, 1000);
		} else {
			// Snap back to original position
			resetCardPosition();
		}

		isDragging = false;
		currentX = 0;
		swipeDirection = null;
	}

	function resetCardPosition() {
		if (cardElement) {
			cardElement.style.transform = 'translateX(0)';
			cardElement.style.transition = 'transform 0.3s ease-out';
		}
		swipeRevealed = false;
	}

	function handleTap() {
		// Add scale animation for feedback
		if (cardElement && animated) {
			cardElement.style.transform = 'scale(0.98)';
			cardElement.style.transition = 'transform 0.1s ease-out';
			
			setTimeout(() => {
				cardElement.style.transform = 'scale(1)';
			}, 100);
		}

		dispatch('select', token);
	}

	function handleLongPress() {
		// Haptic feedback for long press
		if (navigator.vibrate) {
			navigator.vibrate([50, 50, 50]);
		}

		// Show context menu or quick actions
		dispatch('quickAction', { token, action: 'longPress' });
	}

	function handleQuickAction(action: string, event?: Event) {
		if (event) {
			event.stopPropagation();
		}
		
		// Haptic feedback
		if (navigator.vibrate) {
			navigator.vibrate(30);
		}

		dispatch('quickAction', { token, action });
	}

	function toggleFavorite(event: Event) {
		event.stopPropagation();
		dispatch('favorite', token);
		
		// Haptic feedback
		if (navigator.vibrate) {
			navigator.vibrate(favorited ? 20 : 40);
		}
	}

	function getTokenTypeIcon(type: string): string {
		switch (type?.toUpperCase()) {
			case 'ARC200': return 'fas fa-layer-group';
			case 'ASA': return 'fas fa-cube';
			case 'VOI': return 'fas fa-star';
			default: return 'fas fa-coins';
		}
	}

	function getTokenTypeColor(type: string): string {
		switch (type?.toUpperCase()) {
			case 'ARC200': return 'text-blue-600 dark:text-blue-400';
			case 'ASA': return 'text-green-600 dark:text-green-400';
			case 'VOI': return 'text-purple-600 dark:text-purple-400';
			default: return 'text-gray-600 dark:text-gray-400';
		}
	}

	function getPerformanceColor(value: number): string {
		if (value > 5) return 'text-green-600 dark:text-green-400';
		if (value > 0) return 'text-green-500 dark:text-green-300';
		if (value > -5) return 'text-orange-500 dark:text-orange-300';
		return 'text-red-600 dark:text-red-400';
	}

	function formatCurrency(value: number): string {
		if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
		if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
		if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
		return `$${value.toFixed(2)}`;
	}

	function formatPercentage(value: number): string {
		return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
	}

	function formatNumber(value: number): string {
		if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
		if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
		if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
		return value.toString();
	}
</script>

<!-- Main card container -->
<div 
	bind:this={cardElement}
	class="relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden select-none {
		selected ? 'ring-2 ring-purple-500 ring-offset-2' : ''
	} {
		compact ? 'p-3' : 'p-4'
	}"
	class:pressed={isPressed}
	class:dragging={isDragging}
>
	<!-- Background swipe actions -->
	{#if showQuickActions}
		<!-- Left swipe action (favorite) -->
		<div 
			class="absolute inset-y-0 right-0 w-20 bg-yellow-500 flex items-center justify-center transition-opacity duration-200 {
				swipeDirection === 'left' ? 'opacity-100' : 'opacity-0'
			}"
		>
			<i class="fas fa-star text-white text-xl"></i>
		</div>

		<!-- Right swipe action (compare) -->
		<div 
			class="absolute inset-y-0 left-0 w-20 bg-blue-500 flex items-center justify-center transition-opacity duration-200 {
				swipeDirection === 'right' ? 'opacity-100' : 'opacity-0'
			}"
		>
			<i class="fas fa-balance-scale text-white text-xl"></i>
		</div>
	{/if}

	<!-- Card content -->
	<div class="relative z-10 bg-white dark:bg-gray-800">
		<!-- Header -->
		<div class="flex items-center justify-between mb-3">
			<div class="flex items-center gap-3 flex-1 min-w-0">
				<!-- Token icon/image -->
				<div class="flex-shrink-0">
					{#if token.imageUrl}
						<img 
							src={token.imageUrl} 
							alt="{token.symbol} logo"
							class="w-10 h-10 rounded-full border-2 border-gray-200 dark:border-gray-600"
							on:error={(e) => (e.currentTarget.style.display = 'none')}
						/>
					{:else}
						<div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center">
							<i class="{getTokenTypeIcon(token.type)} text-white text-lg"></i>
						</div>
					{/if}
				</div>

				<!-- Token info -->
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2">
						<h3 class="font-bold text-gray-900 dark:text-white text-lg truncate">
							{token.symbol}
						</h3>
						<Badge class="text-xs px-2 py-1 {
							token.type === 'VOI' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
							token.type === 'ARC200' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
							'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
						}">
							{token.type}
						</Badge>
					</div>
					{#if !compact}
						<p class="text-sm text-gray-500 dark:text-gray-400 truncate">
							{token.poolCount} pools • ID: {token.id}
						</p>
					{/if}
				</div>
			</div>

			<!-- Favorite button -->
			<button
				type="button"
				class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors {
					favorited 
						? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' 
						: 'text-gray-400 hover:text-yellow-500 hover:bg-gray-50 dark:hover:bg-gray-700'
				}"
				on:click={toggleFavorite}
				aria-label="Toggle favorite"
			>
				<i class="fas fa-star text-sm"></i>
			</button>
		</div>

		<!-- Metrics grid -->
		<div class="grid grid-cols-2 gap-3 {compact ? 'text-sm' : ''}">
			<!-- Price and change -->
			<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
				<div class="flex items-center justify-between mb-1">
					<span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
						Price
					</span>
					<i class="fas fa-dollar-sign text-gray-400 text-xs"></i>
				</div>
				<div class="font-bold text-gray-900 dark:text-white {compact ? 'text-lg' : 'text-xl'}">
					{formatCurrency(metrics.price)}
				</div>
				<div class="flex items-center gap-1 mt-1">
					<span class="text-xs font-medium {getPerformanceColor(metrics.priceChange24h)}">
						{formatPercentage(metrics.priceChange24h)}
					</span>
					<span class="text-xs text-gray-400">24h</span>
				</div>
			</div>

			<!-- Volume -->
			<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
				<div class="flex items-center justify-between mb-1">
					<span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
						Volume
					</span>
					<i class="fas fa-chart-bar text-gray-400 text-xs"></i>
				</div>
				<div class="font-bold text-gray-900 dark:text-white {compact ? 'text-lg' : 'text-xl'}">
					{formatCurrency(metrics.volume24h)}
				</div>
				{#if metrics.uniqueTraders24h > 0}
					<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
						{formatNumber(metrics.uniqueTraders24h)} traders
					</div>
				{/if}
			</div>

			{#if !compact}
				<!-- TVL -->
				<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
					<div class="flex items-center justify-between mb-1">
						<span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
							TVL
						</span>
						<i class="fas fa-lock text-gray-400 text-xs"></i>
					</div>
					<div class="font-bold text-gray-900 dark:text-white text-xl">
						{formatCurrency(metrics.tvl)}
					</div>
				</div>

				<!-- Market Cap -->
				<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
					<div class="flex items-center justify-between mb-1">
						<span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
							Market Cap
						</span>
						<i class="fas fa-coins text-gray-400 text-xs"></i>
					</div>
					<div class="font-bold text-gray-900 dark:text-white text-xl">
						{formatCurrency(metrics.marketCap)}
					</div>
				</div>
			{/if}
		</div>

		{#if !compact}
			<!-- Activity indicators -->
			<div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
				<div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
					{#if metrics.swapCount24h > 0}
						<div class="flex items-center gap-1">
							<i class="fas fa-exchange-alt text-xs"></i>
							<span>{formatNumber(metrics.swapCount24h)} swaps</span>
						</div>
					{/if}
					
					<div class="flex items-center gap-1">
						<i class="fas fa-swimming-pool text-xs"></i>
						<span>{token.poolCount} pools</span>
					</div>
				</div>

				<!-- Performance indicator -->
				<div class="flex items-center gap-2">
					{#if metrics.priceChange24h > 0}
						<div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
					{:else if metrics.priceChange24h < 0}
						<div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
					{:else}
						<div class="w-2 h-2 rounded-full bg-gray-400"></div>
					{/if}
					<span class="text-xs text-gray-500 dark:text-gray-400">
						{metrics.priceChange24h > 0 ? 'Gaining' : metrics.priceChange24h < 0 ? 'Losing' : 'Stable'}
					</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Loading overlay -->
	{#if !analytics}
		<div class="absolute inset-0 bg-white/80 dark:bg-gray-800/80 flex items-center justify-center z-20" transition:fade>
			<div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
				<i class="fas fa-spinner fa-spin"></i>
				<span class="text-sm">Loading...</span>
			</div>
		</div>
	{/if}
</div>

<!-- Touch instructions (only show on first interaction) -->
{#if showQuickActions && typeof localStorage !== 'undefined' && !localStorage.getItem('mobileCardInstructionsShown')}
	<div 
		class="fixed bottom-4 left-4 right-4 bg-black/80 text-white text-sm p-3 rounded-lg backdrop-blur-sm z-50"
		transition:slide
		on:click={() => {
			localStorage.setItem('mobileCardInstructionsShown', 'true');
		}}
	>
		<div class="flex items-center gap-3">
			<i class="fas fa-hand-paper text-yellow-400"></i>
			<div class="flex-1">
				<div class="font-medium">Touch Controls</div>
				<div class="text-xs opacity-80">Tap to select • Swipe left to favorite • Swipe right to compare • Long press for more</div>
			</div>
			<button class="text-white/60 hover:text-white">
				<i class="fas fa-times"></i>
			</button>
		</div>
	</div>
{/if}

<style>
	.pressed {
		transform: scale(0.98);
		transition: transform 0.1s ease-out;
	}

	.dragging {
		z-index: 10;
	}

	/* Smooth transitions for non-dragging states */
	:not(.dragging) {
		transition: transform 0.3s ease-out;
	}

	/* Custom scrollbar for mobile */
	:global(.mobile-scroll) {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	:global(.mobile-scroll::-webkit-scrollbar) {
		display: none;
	}

	/* Prevent text selection during gestures */
	.select-none {
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
	}

	/* Improve touch targets */
	button {
		min-height: 44px;
		min-width: 44px;
	}
</style>