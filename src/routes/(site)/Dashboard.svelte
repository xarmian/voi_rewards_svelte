<script lang="ts">
	import { onMount } from 'svelte';
	import { rewardParams } from '../../stores/dataTable';
    import { algodClient } from '$lib/utils/algod';
	import { writable } from 'svelte/store';
	import { config } from '$lib/config';
	import { Modal } from 'flowbite-svelte';
	import RewardsTable from './RewardsTable.svelte';
	import DashboardCard from '$lib/components/DashboardCard.svelte';
	import RecentProposers from '$lib/components/RecentProposers.svelte';
	import MiniStakeChart from '$lib/components/MiniStakeChart.svelte';
	import MiniBlockChart from '$lib/components/MiniBlockChart.svelte';
	import WalletSearch from '$lib/component/WalletSearch.svelte';
	import { goto } from '$app/navigation';
	import { utcToLocalDate } from 'svelte-ux/utils/date';
	interface Supply {
		[key: string]: number;
	}

	const latestBlock = writable({ block: 0, timestamp: '' });

	function handleLatestBlock(event: CustomEvent) {
		latestBlock.set(event.detail);
		// Update total blocks count
		totalBlocks += event.detail.newNonBallastBlocks;
	}

	$: totalBlocks = 0;
	$: totalWallets = 0;
	$: block_height = 0;
	$: block_height_timestamp = '';
	$: selectedDate = '';
	$: dataArrays = [];
	$: dataIncomplete = false;
	let dates: { id: string; desc: string; epoch: number; }[] = [];
	let supply: Supply = {};
	let ballasts: string[] = [];
	let showEnlargedStakeChart = false;
	let showEnlargedBlockChart = false;
	let onlineStakeHistory: any[] = [];

	const populateDateDropdown = async () => {
		const url = `${config.proposalApiBaseUrl}`;
		await fetch(url, { cache: 'no-store' })
			.then((response) => response.json())
			.then((data) => {
                const minTimestamp = new Date('2024-10-30T00:00:00Z');
				const maxTimestamp = new Date(data.max_timestamp);

				dates = [];

				let currentDate = new Date(minTimestamp.toISOString().substring(0, 10) + 'T00:00:00Z');
				let epoch = 1;
				while (currentDate <= maxTimestamp) {
					let startOfWeek = new Date(currentDate);
					startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay() + 3); // Wednesday

					const endOfWeek = new Date(startOfWeek);
					endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 6); // Tuesday

					const dateStr = `${startOfWeek
						.toISOString()
						.substring(0, 10)
						.replace(/-/g, '')}-${endOfWeek.toISOString().substring(0, 10).replace(/-/g, '')}`;
					dates = [
						...dates,
						{
							id: dateStr,
							desc: dateStr.replace(
								/(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})/,
								'$1-$2-$3 to $4-$5-$6'
							),
							epoch: epoch
						}
					];
					currentDate.setUTCDate(currentDate.getUTCDate() + 7); // Next week
					epoch++;
				}
				selectedDate = dates[dates.length - 1].id;
			})
			.catch((error) => {
				console.error(error);
			});
	};

	const findCommonRatio = (a: number, totalSum: number, n: number) => {
		// Using numerical method (binary search) to find r
		// where a(1-r^n)/(1-r) = totalSum
		let left = 0.1;  // Lower bound for r
		let right = 2.0; // Upper bound for r
		const epsilon = 0.0000001; // Precision

		while (right - left > epsilon) {
			const mid = (left + right) / 2;
			const sum = a * (1 - Math.pow(mid, n)) / (1 - mid);
			
			if (sum < totalSum) {
				left = mid;
			} else {
				right = mid;
			}
		}
		
		return (left + right) / 2;
	}

	const getTokensByEpoch = async (epoch: number) => {
		// tokens = 3000000 for epoch 1
		// tokens = a * r^(i-1)
		const a = 3_000_000;
		const totalSum = 1_000_000_000;
		const n = 1042;
		const r = findCommonRatio(a, totalSum, n);
		return Math.round(a * Math.pow(r, epoch - 1));
	}

	const loadDashboardData = async (selectedDate: string) => {
		// derive start and end dates from the selected date of format YYYYMMDD-YYYYMMDD
		const startDate =
			selectedDate.substring(0, 4) +
			'-' +
			selectedDate.substring(4, 6) +
			'-' +
			selectedDate.substring(6, 8);
		const endDate =
			selectedDate.substring(9, 13) +
			'-' +
			selectedDate.substring(13, 15) +
			'-' +
			selectedDate.substring(15, 17);
		// const url = `${config.proposalApiBaseUrl}?start=${startDate}&end=${endDate}`;
		const url = `${config.proposalApiBaseUrl}?start=${startDate}&end=${endDate}`;

		// check endDate, if 2023-12-31 or more recent, set block reward pool to 25000000, otherwise set block reward pool to 12500000
		const endOfEpoch = new Date(
			Date.UTC(
				parseInt(selectedDate.substring(9, 13)),
				parseInt(selectedDate.substring(13, 15)) - 1,
				parseInt(selectedDate.substring(15, 17))
			)
		);

		// set default rewards based on epoch
		endOfEpoch.setUTCHours(23, 59, 59, 999);

		// reinitialize totals
		totalWallets = 0;
		totalBlocks = 0;
		block_height = 0;

		fetch(url, { cache: 'no-store' })
			.then((response) => response.json())
			.then(async (data) => {
				// check if the end date selected in dropdown is more than maxTimestamp. If so, add notice below date selection that data is incomplete
				const checkDate = new Date(
					Date.UTC(
						parseInt(selectedDate.substring(9, 13)),
						parseInt(selectedDate.substring(13, 15)) - 1,
						parseInt(selectedDate.substring(15, 17))
					)
				);
				const endOfDay = new Date(checkDate);
				endOfDay.setUTCHours(23, 59, 59, 999);

				dataIncomplete = endOfDay > new Date(data.max_timestamp) ? true : false;

				// Sort the data by block count
				data.data.sort((a: any, b: any) => b.block_count - a.block_count);
				dataArrays = data.data;

				//calcRewards();
				block_height = data.block_height;
				block_height_timestamp = new Date(data.max_timestamp).toLocaleString('en-US', {
					timeZone: 'UTC'
				});

				ballasts = data.blacklist;
				totalWallets = data.num_proposers;
				totalBlocks = data.num_blocks;
				latestBlock.set({ block: data.block_height, timestamp: block_height_timestamp });
				updateRewardParams();
			});
	};


	onMount(async () => {
		// get online stake
		supply = await algodClient.supply().do();

		await populateDateDropdown();
		await loadDashboardData(selectedDate);
	});

	const updateRewardParams = async () => {
		const tokens = await getTokensByEpoch(dates.find(date => date.id === selectedDate)?.epoch || 1);
		rewardParams.set({
			block_reward_pool: tokens,
			total_blocks: totalBlocks,
		});
	}

	$: if (selectedDate) {
		loadDashboardData(selectedDate);
	}

	async function refreshDashboardData() {
		await loadDashboardData(selectedDate);
	}

	async function fetchOnlineStakeHistory() {
		const response = await fetch('https://api.voirewards.com/proposers/index_main_3.php?action=online-stake-history');
		onlineStakeHistory = await response.json();
	}

	function handleStakeChartClick() {
		fetchOnlineStakeHistory();
		showEnlargedStakeChart = true;
	}

	function handleBlockChartClick() {
		fetchOnlineStakeHistory();
		showEnlargedBlockChart = true;
	}

	function handleWalletSearch(address: string) {
		goto(`/wallet/${address}`);
	}

</script>

<div class="bg-gradient-to-b from-purple-100 to-white dark:from-gray-900 dark:to-gray-800 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
	<div class="max-w-7xl mx-auto">
		<!-- Phase 2 Banner -->
		<!--<div class="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg shadow-lg mb-8 p-6 text-center">
			<h2 class="text-2xl font-bold mb-2">Looking for Your TestNet Phase 2 Estimated Rewards?</h2>
			<a href="/phase2" class="inline-block bg-white text-purple-600 font-semibold px-4 py-2 rounded-full hover:bg-purple-100 transition duration-300">Visit our Phase 2 Page Here!</a>
		</div>-->

		<!-- Dashboard Cards -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
			<!--<DashboardCard title="Last Block" value={$latestBlock.block > 0 ? $latestBlock.block.toLocaleString() : null} subvalue={$latestBlock.timestamp + " UTC"} info="The last block produced on the network." />-->
			<DashboardCard title="Participating Wallets" value={totalWallets > 0 ? totalWallets.toLocaleString() : null} info="The number of unique wallets that have proposed a block in the current epoch." />
			<!--<div on:click={handleBlockChartClick} class="cursor-pointer">
				<DashboardCard title="Rewarded Blocks this Epoch" value={totalBlocks > 0 ? Math.floor(totalBlocks).toLocaleString() : null} subvalue={'~' + (totalBlocks > 0 ? ($rewardParams.block_reward_pool / totalBlocks).toFixed(2) + ' $VOI/block' : '')} info="The number of blocks produced by the community." />
			</div>-->
			<div on:click={handleBlockChartClick} class="cursor-pointer">
				<DashboardCard title={"Rewards for Epoch " + dates.find(date => date.id === selectedDate)?.epoch} value={`${Math.round($rewardParams.block_reward_pool).toLocaleString()} VOI`} subvalue={'~' + ($rewardParams.block_reward_pool / 216000).toFixed(2) + ' $VOI/block'} info="The number of blocks produced in a typical epoch." />
			</div>
			<div on:click={handleStakeChartClick} class="cursor-pointer">
				<DashboardCard 
					title="Online Stake" 
					value={Math.round(supply['online-money']/Math.pow(10,6)).toLocaleString() + ' VOI'} 
					info="The total amount of VOI that is currently online and participating in the network." 
					showChart={true}
				/>
			</div>
			<RecentProposers on:latestBlock={handleLatestBlock} {ballasts} />
		</div>

		<div class="flex justify-center items-center gap-3 mb-6">
			<label 
				for="epoch-selector" 
				class="font-medium text-gray-700 dark:text-gray-300"
			>
				Epoch:
			</label>
			<select
				id="epoch-selector"
				bind:value={selectedDate}
				class="block w-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 
					   rounded-lg px-4 py-2
					   focus:ring-2 focus:ring-purple-500 focus:border-purple-500
					   dark:text-gray-300 dark:focus:ring-purple-400
					   transition-colors duration-200"
			>
				{#each dates as date}
					<option value={date.id}>
						{date.desc}
					</option>
				{/each}
			</select>
		</div>

		<div class="mb-6">
			<WalletSearch onSubmit={handleWalletSearch} loadPreviousValue={false} />
		</div>

		<!-- Action Buttons -->
		<div class="flex-col sm:flex-row justify-center gap-4 mb-8 hidden">
			<a href="https://voinetwork.github.io/voi-swarm/getting-started/introduction/" target="_blank" class="btn-primary">
				Learn to Run a Node
			</a>
			<a href="/leaderboard" class="btn-secondary">
				Phase 2 Leaderboard
			</a>
			<a href="/phase2" class="btn-secondary">
				Phase 2 Reward Estimates
			</a>
		</div>
		
		<!-- Rewards Table -->
		{#if dataArrays.length > 0}
			<RewardsTable items={dataArrays} refreshData={refreshDashboardData} />
		{/if}
	</div>
</div>

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

{#if showEnlargedBlockChart}
<Modal bind:open={showEnlargedBlockChart} size="xl">
	<h2 class="text-2xl font-bold mb-4">Block Production History</h2>
	{#if onlineStakeHistory.length > 0}
		<MiniBlockChart chartData={onlineStakeHistory} />
	{:else}
		<p>Loading chart data...</p>
	{/if}
	</Modal>
{/if}

<style>
	.btn-primary {
		@apply bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 text-center;
	}
	.btn-secondary {
		@apply bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 text-center;
	}
</style>
