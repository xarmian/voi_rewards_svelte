<script lang="ts">
	import { onMount } from 'svelte';
	import { rewardParams } from '../../stores/dataTable';
	import { writable } from 'svelte/store';
	import { Modal } from 'flowbite-svelte';
	import RewardsTable from './RewardsTable.svelte';
	import MiniStakeChart from '$lib/components/MiniStakeChart.svelte';
	import WalletSearch from '$lib/component/WalletSearch.svelte';
	import { goto } from '$app/navigation';
	import { getSupplyInfo, onlineStakeStore } from '$lib/stores/accounts';
	import type { SupplyInfo } from '$lib/stores/accounts';
	import { getTokensByEpoch, extrapolateRewardPerBlock, formatNumber } from '$lib/utils';
	import { dataTable } from '../..//stores/dataTable';
	
	interface DataArrayItem {
		proposer: string;
		block_count: number;
		block_rewards: number;
		health_rewards: number;
		nfd?: string;
		rank?: number;
		epoch_block_rewards?: number;
		total_rewards?: number;
	}

	const latestBlock = writable({ block: 0, timestamp: '' });
	let currentPrice: number | null = null;
	let priceChange24h: number | null = null;

	function handleLatestBlock(event: CustomEvent) {
		latestBlock.set(event.detail);
		// Update total blocks count
		//totalBlocks += event.detail.newNonBallastBlocks;
	}

	$: totalBlocks = 0;
	$: totalWallets = 0;
	$: block_height = 0;
	$: block_height_timestamp = '';
	$: selectedDate = '';
	$: dataArrays = [] as DataArrayItem[];
	$: dataIncomplete = false;
	let dates: { id: string; desc: string; epoch: number; }[] = [];
	let supply: SupplyInfo | null = null;
	let ballasts: string[] = [];
	let showEnlargedStakeChart = false;
	let onlineStakeHistory: any[] = [];
	let eligibleOnlineStake = 0;
	let isLoading = true;
	let isRefreshing = false;
	let error: string | null = null;

	const populateDateDropdown = async () => {
		try {
			dates = await dataTable.fetchDateRanges();
			selectedDate = dates[dates.length - 1].id;
		} catch (error) {
			console.error(error);
		}
	};

	const loadDashboardData = async (selectedDate: string) => {
		//isLoading = true;
		isRefreshing = true;
		error = null; // Reset error state
		try {
			const [data, marketsResponse] = await Promise.all([
				dataTable.fetchData(selectedDate),
				fetch('/api/markets?token=VOI')
			]);
			
			const marketsData = await marketsResponse.json();
			if (marketsData.aggregates) {
				currentPrice = marketsData.aggregates.weightedAveragePrice;
				const firstMarket = marketsData.marketData[0];
				if (firstMarket) {
					priceChange24h = firstMarket.price_change_percentage_24h;
				}
			}

			const { data: onlineAccountCount, error: onlineAccountCountError } = await fetch('/api/mimir?action=get_online_account_count').then(res => res.json());
			if (onlineAccountCountError) {
				console.error('Error fetching online account count:', onlineAccountCountError);
			} else {
				totalWallets = onlineAccountCount;
			}

			dataIncomplete = false;
			if (data) {
				const checkDate = new Date(
					Date.UTC(
						parseInt(selectedDate.substring(9, 13)),
						parseInt(selectedDate.substring(13, 15)) - 1,
						parseInt(selectedDate.substring(15, 17))
					)
				);
				const endOfDay = new Date(checkDate);
				endOfDay.setUTCHours(23, 59, 59, 999);

				dataIncomplete = endOfDay > new Date(data.max_timestamp);
				
				// Update local state - ensure reactivity by creating a new array
				dataArrays = [...data.data];
				ballasts = [...data.blacklist];
				//totalWallets = data.num_proposers;
				totalBlocks = data.num_blocks + Math.min(data.num_blocks / 3, data.num_blocks_ballast);
				latestBlock.set({ block: data.block_height, timestamp: block_height_timestamp });
				
				await updateRewardParams();
				eligibleOnlineStake = getEligibleOnlineStake();
			}
		} catch (err) {
			console.error('Error loading dashboard data:', err);
			error = err instanceof Error ? err.message : 'Failed to load dashboard data';
		} finally {
			isLoading = false;
			isRefreshing = false;
		}
	};

	onMount(async () => {
		isLoading = true;
		try {
			// get online stake
			supply = await getSupplyInfo();
			await populateDateDropdown();
			
			// If selectedDate was set by populateDateDropdown, it will trigger loadDashboardData
			// If not, we need to load it explicitly
			if (!selectedDate && dates.length > 0) {
				selectedDate = dates[dates.length - 1].id;
				await loadDashboardData(selectedDate);
			}
		} catch (error) {
			console.error('Error initializing dashboard:', error);
		} finally {
			isLoading = false;
		}
	});

	$: if (selectedDate) {
		loadDashboardData(selectedDate);
	}

	const updateRewardParams = async () => {
		const currentEpoch = dates.find(date => date.id === selectedDate)?.epoch || 1;
		const tokens = await getTokensByEpoch(currentEpoch);
		
		// Calculate projections using the utility function
		const { projectedTotalBlocks, projectedRewardPerBlock } = extrapolateRewardPerBlock(
			totalBlocks,
			tokens,
			selectedDate
		);

		// Update the reward parameters
		rewardParams.update((params) => ({
			...params,
			block_reward_pool: tokens,
			total_blocks: totalBlocks,
			reward_per_block: projectedRewardPerBlock,
			total_blocks_projected: projectedTotalBlocks,
		}));
	};

	async function refreshDashboardData() {
		dataTable.clearCache(); // Clear the cache before fetching new data
		await loadDashboardData(selectedDate);
	}

	async function fetchOnlineStakeHistory() {
		onlineStakeHistory = await onlineStakeStore.getData();
	}

	function handleStakeChartClick() {
		fetchOnlineStakeHistory();
		showEnlargedStakeChart = true;
	}

	function handleWalletSearch(address: string) {
		goto(`/wallet/${address}`);
	}

	function getEligibleOnlineStake() {
		const commonBalance = (supply?.['online-money'] ?? 0) - (supply?.['blacklisted-money'] ?? 0);
		return Math.round((commonBalance + Math.min(supply?.['blacklisted-money'] ?? 0, commonBalance/3))/Math.pow(10,6));
	}

</script>

	<!-- Hero Section -->
	<div class="relative overflow-hidden">
		<div class="absolute inset-0">
			<div class="stars"></div>
			<div class="twinkling"></div>
		</div>
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20 relative">
			<div class="text-center">
				<h1 class="text-4xl sm:text-6xl font-bold text-[#00ff00] glow-text mb-6 uppercase tracking-wider">
					Welcome to Voi Network
					<span class="inline-block animate-rocket">🚀</span>
				</h1>
				<p class="text-xl text-[#ff00ff] glow-text-pink mb-8 max-w-2xl mx-auto">
					TO THE MOON! Track rewards and join the future of decentralized consensus.
					<span class="inline-block animate-bounce">💎</span>
					<span class="inline-block">🙌</span>
				</p>
				<div class="max-w-xl mx-auto relative z-20">
					<WalletSearch onSubmit={handleWalletSearch} loadPreviousValue={false} />
				</div>
			</div>
		</div>
	</div>

	{#if isLoading}
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
			<!-- Loading animation for stats cards -->
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
				{#each Array(4) as _, i}
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 relative overflow-hidden">
						<!-- Animated gradient overlay -->
						<div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"></div>
						
						<!-- Card content skeleton -->
						<div class="flex flex-col gap-3">
							<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse"></div>
							<div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse"></div>
							<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse"></div>
							
							<!-- Animated icon placeholder -->
							<div class="absolute top-2 right-2">
								<div class="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 animate-spin-slow"></div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Loading animation for quick links -->
			<div class="mt-12">
				<div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-6 animate-pulse"></div>
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
					{#each Array(4) as _}
						<div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 relative overflow-hidden">
							<div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"></div>
							<div class="flex items-center">
								<div class="w-12 h-12 rounded-lg bg-purple-100/50 dark:bg-purple-900/50 animate-pulse"></div>
								<div class="ml-4 flex-1">
									<div class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2 animate-pulse"></div>
									<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse"></div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{:else if error}
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
			<div class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-100 px-4 py-3 rounded-lg relative" role="alert">
				<strong class="font-bold">Error!</strong>
				<span class="block sm:inline ml-2">{error}</span>
			</div>
		</div>
	{:else}
		<!-- Network Stats Section -->
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
			<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Network Overview</h2>
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
				<!-- Price Card -->
				<a href="/markets" class="flex flex-col justify-between bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 relative group hover:ring-2 hover:ring-purple-500 dark:hover:ring-purple-400 transition-all duration-200">
					<div class="flex flex-col">
						<div class="absolute top-2 right-2">
							<div class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 transition-colors duration-200">
								<i class="fas fa-chart-line text-gray-600 dark:text-gray-300 text-sm"></i>
							</div>
						</div>
						<p class="text-sm text-gray-500 dark:text-gray-400">Current Price</p>
						<p class="text-2xl font-bold text-gray-900 dark:text-white">
							${currentPrice ? formatNumber(currentPrice, 6) : '-.--'}
							{#if priceChange24h}
								<span class="text-sm ml-2 {priceChange24h >= 0 ? 'text-green-500' : 'text-red-500'}">
									{priceChange24h >= 0 ? '+' : ''}{formatNumber(priceChange24h, 2)}%
								</span>
							{/if}
						</p>
					</div>
					<p class="text-sm text-purple-600 dark:text-purple-400 mt-2">View Markets →</p>
				</a>

				<!-- Online Stake Card -->
				<button
					on:click={handleStakeChartClick}
					class="flex flex-col justify-between bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 relative group text-left hover:ring-2 hover:ring-purple-500 dark:hover:ring-purple-400 transition-all duration-200"
				>
					<div class="flex flex-col">
						<div class="absolute top-2 right-2">
							<div class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 transition-colors duration-200">
								<i class="fas fa-chart-area text-gray-600 dark:text-gray-300 text-sm"></i>
							</div>
						</div>
						<p class="text-sm text-gray-500 dark:text-gray-400">Online Stake</p>
						<p class="text-2xl font-bold text-gray-900 dark:text-white">
							{supply ? Math.round((supply?.['online-money']??0)/Math.pow(10,6)).toLocaleString() + ' VOI' : '-'}
						</p>
						<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
							Eligible: {eligibleOnlineStake > 0 ? eligibleOnlineStake.toLocaleString() + ' VOI' : '-'}
						</p>
					</div>
					<p class="text-sm text-purple-600 dark:text-purple-400 mt-2">View Chart →</p>
				</button>

				<!-- Rewards Card -->
				<button
					on:click={() => {
						document.querySelector('#rewards-section')?.scrollIntoView({ behavior: 'smooth' });
					}}
					class="flex flex-col justify-between bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 relative group text-left hover:ring-2 hover:ring-purple-500 dark:hover:ring-purple-400 transition-all duration-200"
				>
					<div class="flex flex-col">
						<div class="absolute top-2 right-2">
							<div class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 transition-colors duration-200">
								<i class="fas fa-gift text-gray-600 dark:text-gray-300 text-sm"></i>
							</div>
						</div>
						<p class="text-sm text-gray-500 dark:text-gray-400">{"Rewards for Epoch " + (dates.find(date => date.id === selectedDate)?.epoch || '-')}</p>
						<p class="text-2xl font-bold text-gray-900 dark:text-white">
							{$rewardParams.block_reward_pool > 0 ? `${Math.round($rewardParams.block_reward_pool).toLocaleString()} VOI` : '-'}
						</p>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							{eligibleOnlineStake > 0 ? `~${(($rewardParams.block_reward_pool / eligibleOnlineStake) * 52 * 100).toFixed(2)}% APR` : ''}
						</p>
					</div>
					<p class="text-sm text-purple-600 dark:text-purple-400 mt-2">View Details →</p>
				</button>

				<!-- Participation Card -->
				<a href="/analytics" class="flex flex-col justify-between bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 relative group hover:ring-2 hover:ring-purple-500 dark:hover:ring-purple-400 transition-all duration-200">
					<div class="flex flex-col">
						<div class="absolute top-2 right-2">
							<div class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 transition-colors duration-200">
								<i class="fas fa-users text-gray-600 dark:text-gray-300 text-sm"></i>
							</div>
						</div>
						<p class="text-sm text-gray-500 dark:text-gray-400">Network Participation</p>
						<p class="text-2xl font-bold text-gray-900 dark:text-white">
							{totalWallets > 0 ? totalWallets.toLocaleString() : '-'}
						</p>
						<p class="text-sm text-gray-500 dark:text-gray-400">Online Accounts</p>
					</div>
					<p class="text-sm text-purple-600 dark:text-purple-400 mt-2">View Analytics →</p>
				</a>
			</div>
		</div>

		<!-- Quick Links Section -->
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
			<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Quick Links</h2>
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				<!-- Run a Node Card -->
				<a href="/how_to_node" class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:ring-2 hover:ring-purple-500 dark:hover:ring-purple-400 transition-all duration-200">
					<div class="flex items-center mb-4">
						<div class="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
							<i class="fas fa-server text-2xl text-purple-600 dark:text-purple-400"></i>
						</div>
						<div class="ml-4">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Run a Node</h3>
							<p class="text-sm text-gray-500 dark:text-gray-400">Start participating in consensus</p>
						</div>
					</div>
				</a>

				<!-- Calculator Card -->
				<a href="/calculator" class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:ring-2 hover:ring-purple-500 dark:hover:ring-purple-400 transition-all duration-200">
					<div class="flex items-center mb-4">
						<div class="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
							<i class="fas fa-calculator text-2xl text-purple-600 dark:text-purple-400"></i>
						</div>
						<div class="ml-4">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Calculator</h3>
							<p class="text-sm text-gray-500 dark:text-gray-400">Calculate potential rewards</p>
						</div>
					</div>
				</a>

				<!-- Directory Card -->
				<a href="/directory" class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:ring-2 hover:ring-purple-500 dark:hover:ring-purple-400 transition-all duration-200">
					<div class="flex items-center mb-4">
						<div class="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
							<i class="fas fa-book text-2xl text-blue-600 dark:text-blue-400"></i>
						</div>
						<div class="ml-4">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Directory</h3>
							<p class="text-sm text-gray-500 dark:text-gray-400">Explore the ecosystem</p>
						</div>
					</div>
				</a>

				<!-- FAQ Card -->
				<a href="/faq" class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:ring-2 hover:ring-purple-500 dark:hover:ring-purple-400 transition-all duration-200">
					<div class="flex items-center mb-4">
						<div class="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
							<i class="fas fa-question-circle text-2xl text-green-600 dark:text-green-400"></i>
						</div>
						<div class="ml-4">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">FAQ</h3>
							<p class="text-sm text-gray-500 dark:text-gray-400">Get your questions answered</p>
						</div>
					</div>
				</a>
			</div>
		</div>

		<!-- Rewards Section -->
		<div id="rewards-section" class="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-12 relative z-10">
			<div class="flex flex-col sm:flex-row items-center justify-between mb-6">
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white">Current Epoch Reward Estimates</h2>
				<div class="flex items-center gap-4 mt-4 sm:mt-0">
					<select
						id="epoch-selector"
						bind:value={selectedDate}
						class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 
							rounded-lg px-4 py-2
							focus:ring-2 focus:ring-purple-500 focus:border-purple-500
							dark:text-gray-300 dark:focus:ring-purple-400
							transition-colors duration-200"
					>
						{#each dates as date, index}
							<option value={date.id}>
								Epoch {index + 1}: {date.desc}
							</option>
						{/each}
					</select>
				</div>
			</div>

			{#if dataArrays.length > 0}
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden p-4">
					<RewardsTable items={dataArrays} refreshData={refreshDashboardData} {isRefreshing} />
				</div>
			{/if}
		</div>
	{/if}

<!-- Modals -->
{#if showEnlargedStakeChart}
<Modal bind:open={showEnlargedStakeChart} size="xl">
	<h2 class="text-2xl font-bold mb-4">Online Stake History</h2>
	{#if onlineStakeHistory.length > 0}
		<MiniStakeChart chartData={onlineStakeHistory} />
	{:else}
		<p>Loading chart data...</p>
	{/if}
</Modal>
{/if}

<style>
	@keyframes twinkle {
		0% { opacity: 0; }
		50% { opacity: 1; }
		100% { opacity: 0; }
	}

	@keyframes move {
		from { transform: translateY(0px); }
		to { transform: translateY(-2000px); }
	}

	.stars {
		background: #000 url(http://www.script-tutorials.com/demos/360/images/stars.png) repeat top center;
		z-index: 0;
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		animation: move 150s linear infinite;
	}

	.twinkling {
		background: transparent url(http://www.script-tutorials.com/demos/360/images/twinkling.png) repeat top center;
		z-index: 1;
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		animation: move 100s linear infinite;
	}

	.glow-text {
		text-shadow: 0 0 10px #00ff00;
	}

	.glow-text-pink {
		text-shadow: 0 0 10px #ff00ff;
	}

	.shadow-neon {
		box-shadow: 0 0 15px #00ff00;
	}

	@keyframes rocket {
		0% { transform: translateY(0) rotate(0deg); }
		50% { transform: translateY(-20px) rotate(5deg); }
		100% { transform: translateY(0) rotate(0deg); }
	}

	.animate-rocket {
		animation: rocket 2s ease-in-out infinite;
		display: inline-block;
	}
</style>
