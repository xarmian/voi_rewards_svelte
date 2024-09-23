<script lang="ts">
	import { Card } from 'flowbite-svelte';
	import { onMount, onDestroy } from 'svelte';
	import RewardsTable from './RewardsTable.svelte';
	import { rewardParams } from '../../stores/dataTable';
    import { algodClient } from '$lib/utils/algod';
	import WalletSearch from '$lib/component/WalletSearch.svelte';
	import { goto } from '$app/navigation';
	import { compareVersions } from 'compare-versions';
	import DashboardCard from '$lib/components/DashboardCard.svelte';
	import RecentProposers from '$lib/components/RecentProposers.svelte';
	import { writable } from 'svelte/store';
	import { config } from '$lib/config';
	import CountdownTimer from '$lib/components/CountdownTimer.svelte';

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
	let dates: { id: string; desc: string; }[] = [];
	let supply = {};
	let ballasts: string[] = [];

	const populateDateDropdown = async () => {
		const url = `${config.proposalApiBaseUrl}`;
		await fetch(url, { cache: 'no-store' })
			.then((response) => response.json())
			.then((data) => {
				//const minTimestamp = new Date(data.min_timestamp);
                const minTimestamp = new Date('2023-10-02T00:00:00Z');
				const maxTimestamp = new Date(data.max_timestamp);

				dates = [];

				let currentDate = new Date(minTimestamp.toISOString().substring(0, 10) + 'T00:00:00Z');
				while (currentDate <= maxTimestamp) {
					const startOfWeek = new Date(currentDate);
					startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay() + 1); // Monday
					const endOfWeek = new Date(startOfWeek);
					endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 6); // Sunday
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
							)
						}
					];
					currentDate.setUTCDate(currentDate.getUTCDate() + 7); // Next week
				}
				selectedDate = dates[dates.length - 1].id;
			})
			.catch((error) => {
				console.error(error);
			});
	};

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
		const url = `${config.proposalApiBaseUrl}?start=2024-09-16&end=2024-10-28`;

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
			});
	};


	onMount(async () => {
		await populateDateDropdown();
		loadDashboardData(selectedDate);

		// get online stake
		supply = await algodClient.supply().do();
	});

	$: {
		rewardParams.set({
			block_reward_pool: 0,
			total_blocks: totalBlocks,
		});
	}

	async function refreshDashboardData() {
		await loadDashboardData(selectedDate);
	}
</script>

<div class="bg-gradient-to-b from-purple-100 to-white dark:from-gray-900 dark:to-gray-800 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
	<div class="max-w-7xl mx-auto">
		<!-- Phase 2 Banner -->
		<div class="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg shadow-lg mb-8 p-6 text-center">
			<h2 class="text-2xl font-bold mb-2">Looking for Your TestNet Phase 2 Estimated Rewards?</h2>
			<a href="/phase2" class="inline-block bg-white text-purple-600 font-semibold px-4 py-2 rounded-full hover:bg-purple-100 transition duration-300">Visit our Phase 2 Page Here!</a>
		</div>

		<!-- Countdown Timer -->
		<CountdownTimer 
			targetDate="2024-09-25T00:00:00Z"
			title="Testnet Phase 1 and 2 Airdrop contract configuration deadline"
			subtitle="After this date, the contract configuration will be frozen and no further changes can be made."
			link="https://staking.voi.network"
		/>

		<!-- Dashboard Cards -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
			<DashboardCard title="Last Block" value={$latestBlock.block > 0 ? $latestBlock.block.toLocaleString() : null} subvalue={$latestBlock.timestamp + " UTC"} />
			<DashboardCard title="Participating Wallets" value={totalWallets > 0 ? totalWallets.toLocaleString() : null} />
			<DashboardCard title="Community Produced Blocks" value={totalBlocks > 0 ? totalBlocks.toLocaleString() : null} />
			<DashboardCard title="Online Stake" value={Math.round(supply['online-money']/Math.pow(10,6)).toLocaleString() + ' VOI'} />
			
		</div>
		
		<RecentProposers on:latestBlock={handleLatestBlock} {ballasts} />

		<!-- Action Buttons -->
		<div class="flex flex-col sm:flex-row justify-center gap-4 mb-8">
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

<style>
	.btn-primary {
		@apply bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 text-center;
	}
	.btn-secondary {
		@apply bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 text-center;
	}
</style>
