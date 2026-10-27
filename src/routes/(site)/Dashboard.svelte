<script lang="ts">
	import { onMount } from 'svelte';
	import {
		rewardParams,
		dataTable,
		type DateRange,
		type RewardParams
	} from '../../stores/dataTable';
	import RewardsTable from './RewardsTable.svelte';
	import GotVoiAd from '$lib/component/GotVoiAd.svelte';
	import { getTokensByEpoch, extrapolateRewardPerBlock } from '$lib/utils';
	import type { DashboardData, RewardRows } from '$lib/server/home';

	export let initial: DashboardData['rewards'];
	let dates: DateRange[] = [];
	let selectedDate = '';
	let loadedRange = '';
	let dataArrays: Record<string, unknown>[] = [];
	let totalBlocks = 0;
	let isRefreshing = false;
	let error: string | null = null;
	let mounted = false;
	let appliedInitial: typeof initial | undefined;

	function useRows(data: RewardRows, rangeId: string) {
		dataArrays = data.data.map((row) => ({ ...row }));
		const epoch = dates.find((date) => date.id === rangeId)?.epoch ?? 0;
		totalBlocks =
			epoch >= 62
				? data.num_blocks
				: data.num_blocks + Math.min(data.num_blocks / 3, data.num_blocks_ballast);
		loadedRange = rangeId;
	}

	// Use the server rows during SSR and again when invalidation replaces the data.
	$: if (initial !== appliedInitial) {
		appliedInitial = initial;
		if (initial.state !== 'error') {
			dates = initial.value.dates;
			selectedDate = initial.value.rangeId;
			useRows(initial.value.data as RewardRows, selectedDate);
			error = null;
			void updateRewardParams(initial.value.params);
		}
	}

	async function updateRewardParams(initialParams?: RewardParams) {
		if (initialParams) {
			// This branch must remain synchronous: RewardsTable reads the store in SSR.
			rewardParams.set(initialParams);
			return;
		}
		const currentEpoch = dates.find((date) => date.id === selectedDate)?.epoch || 1;
		const tokens = await getTokensByEpoch(currentEpoch);
		const { projectedTotalBlocks, projectedRewardPerBlock } = extrapolateRewardPerBlock(
			totalBlocks,
			tokens,
			selectedDate
		);
		rewardParams.update((params) => ({
			...params,
			block_reward_pool: tokens,
			total_blocks: totalBlocks,
			reward_per_block: projectedRewardPerBlock,
			total_blocks_projected: projectedTotalBlocks
		}));
	}

	async function loadDashboardData(rangeId: string) {
		isRefreshing = true;
		error = null;
		try {
			const data = await dataTable.fetchData(rangeId);
			useRows(data as RewardRows, rangeId);
			await updateRewardParams();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load dashboard data';
		} finally {
			isRefreshing = false;
		}
	}

	onMount(() => {
		mounted = true;
		if (initial.state === 'error')
			void dataTable
				.fetchDateRanges()
				.then((value) => {
					dates = value;
					selectedDate = dates[dates.length - 1].id;
				})
				.catch((err) => {
					error = err instanceof Error ? err.message : 'Failed to load date ranges';
				});
	});

	$: if (mounted && selectedDate && selectedDate !== loadedRange) {
		loadedRange = selectedDate;
		void loadDashboardData(selectedDate);
	}

	async function refreshDashboardData() {
		dataTable.clearCache();
		await loadDashboardData(selectedDate);
	}
</script>

{#if error}
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
		<div
			class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-100 px-4 py-3 rounded-lg relative"
			role="alert"
		>
			<strong class="font-bold">Error!</strong><span class="block sm:inline ml-2">{error}</span>
		</div>
	</div>
{:else}
	<!-- Quick Links Section -->
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
		<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Quick Links</h2>
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
			<!-- Run a Node Card -->
			<a
				href="/how_to_node"
				class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:ring-2 hover:ring-purple-500 dark:hover:ring-purple-400 transition-all duration-200"
			>
				<div class="flex items-center mb-4">
					<div
						class="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center"
					>
						<i class="fas fa-server text-2xl text-purple-600 dark:text-purple-400"></i>
					</div>
					<div class="ml-4">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Run a Node</h3>
						<p class="text-sm text-gray-500 dark:text-gray-400">Start participating in consensus</p>
					</div>
				</div>
			</a>

			<!-- Calculator Card -->
			<a
				href="/calculator"
				class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:ring-2 hover:ring-purple-500 dark:hover:ring-purple-400 transition-all duration-200"
			>
				<div class="flex items-center mb-4">
					<div
						class="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center"
					>
						<i class="fas fa-calculator text-2xl text-purple-600 dark:text-purple-400"></i>
					</div>
					<div class="ml-4">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Calculator</h3>
						<p class="text-sm text-gray-500 dark:text-gray-400">Calculate potential rewards</p>
					</div>
				</div>
			</a>

			<!-- Directory Card -->
			<a
				href="/directory"
				class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:ring-2 hover:ring-purple-500 dark:hover:ring-purple-400 transition-all duration-200"
			>
				<div class="flex items-center mb-4">
					<div
						class="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center"
					>
						<i class="fas fa-book text-2xl text-blue-600 dark:text-blue-400"></i>
					</div>
					<div class="ml-4">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Directory</h3>
						<p class="text-sm text-gray-500 dark:text-gray-400">Explore the ecosystem</p>
					</div>
				</div>
			</a>

			<!-- FAQ Card -->
			<a
				href="/faq"
				class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:ring-2 hover:ring-purple-500 dark:hover:ring-purple-400 transition-all duration-200"
			>
				<div class="flex items-center mb-4">
					<div
						class="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center"
					>
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

	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 hidden">
		<GotVoiAd />
	</div>

	<!-- Rewards Section -->
	<div id="rewards-section" class="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-12 relative z-10">
		<div class="flex flex-col sm:flex-row items-center justify-between mb-6">
			<h2 class="text-2xl font-bold text-gray-900 dark:text-white">
				Current Epoch Reward Estimates
			</h2>
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

<style lang="postcss">
	:global(.rewards-table) {
		@apply rounded-lg overflow-hidden;
	}
</style>
