<script lang="ts">
	import { Card } from 'flowbite-svelte';
	import { onMount } from 'svelte';
	import RewardsTable from './RewardsTable.svelte';
	import { rewardParams } from '../../stores/dataTable';
    import { algodClient } from '$lib/utils/algod';
	import WalletSearch from '$lib/component/WalletSearch.svelte';

	$: totalBlocks = 0;
	$: totalWallets = 0;
	$: block_height = 0;
	$: block_height_timestamp = '';
	$: totalHealthyNodes = 0;
	$: totalEmptyNodes = 0;
	$: totalExtraNodes = 0;
	$: block_reward_pool = 12500000;
	$: health_reward_pool = 10000000;
	$: selectedDate = '';
	$: dataArrays = [];
	$: dataIncomplete = false;

	let dates: any;
	$: dates = [];

	let supply: any;
	$: supply = {};

	const populateDateDropdown = async () => {
		const url = 'https://socksfirstgames.com/proposers/index_v2.php';
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
		const url = `https://socksfirstgames.com/proposers/index_v2.php?start=${startDate}&end=${endDate}`;

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

                dataArrays.forEach((row: any) => {
                    totalWallets++;
                    totalBlocks += row.block_count;
                });

				//calcRewards();
				block_height = data.block_height;
				block_height_timestamp = new Date(data.max_timestamp).toLocaleString('en-US', {
					timeZone: 'UTC'
				});
				totalHealthyNodes = data.healthy_node_count;
				totalEmptyNodes = data.empty_node_count;
				totalExtraNodes = data.extra_node_count;
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
			block_reward_pool: block_reward_pool,
			health_reward_pool: health_reward_pool,
			total_blocks: totalBlocks,
			total_healthy_nodes: totalHealthyNodes - totalEmptyNodes,
			total_extra_nodes: totalExtraNodes,
		});
	}
</script>

<div class="mt-6 font-bold text-2xl text-center">Epoch</div>
<div class="mb-6 flex justify-center">
	<select
		class="block w-60 dark:bg-gray-700 dark:text-white"
		bind:value={selectedDate}
		on:change={() => loadDashboardData(selectedDate)}
	>
		{#each dates as date}
			<option value={date.id}>{date.desc}</option>
		{/each}
	</select>
    <button class='m-6'
        on:click={() => loadDashboardData(selectedDate)}>
        <i class="fas fa-refresh fa-lg"></i>
    </button>
</div>
{#if dataIncomplete}
	<div class="mb6 flex justify-center">
		<br />
		<div class="block ml-4 text-red-500">
			NOTICE: This Epoch is in progress. Data is incomplete.
		</div>
	</div>
{/if}
<div class="text-center">
	<WalletSearch />
</div>
<div class="dashboard justify-evenly">
	<Card class="bg-gray-100 dark:bg-gray-700 h-42 w-60 m-2">
		<div class="cardInner">
			<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
				Rewarded Blocks
				<br />
				<span class="text-sm">(in epoch)</span>
			</h5>
			<p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
				{totalBlocks == 0 ? '...Loading...' : totalBlocks.toLocaleString()}
			</p>
		</div>
	</Card>
	<Card class="bg-gray-100 dark:bg-gray-700 h-42 w-60 m-2">
		<div class="cardInner">
			<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
				Last Block
			</h5>
			<p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
				{#if block_height == 0}
					...Loading...
				{:else}
					{block_height.toLocaleString()}
					<br />
					<div class="text-sm my-1">
						{block_height_timestamp} UTC
					</div>
				{/if}
			</p>
		</div>
	</Card>
	<Card class="bg-gray-100 dark:bg-gray-700 h-42 w-60 m-2">
		<div class="cardInner">
			<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
				Participating Wallets
			</h5>
			<p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
				{totalWallets == 0 ? '...Loading...' : totalWallets}
			</p>
		</div>
		<br/>
		<div class="cardInner">
			<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
				Online Stake
			</h5>
			<p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
				{(supply['online-money']??0) == 0 ? '...Loading...' : Math.round(supply['online-money']/Math.pow(10,6)).toLocaleString()+' VOI'}
			</p>
		</div>
	</Card>
	<Card class="bg-gray-100 dark:bg-gray-700 h-42 w-60 m-2">
		<div class="cardInner">
			<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
				Total Healthy Nodes
			</h5>
			<p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
				{totalHealthyNodes == 0 ? '...Loading...' : totalHealthyNodes}
			</p>
		</div>
	</Card>
	<Card class="bg-gray-100 dark:bg-gray-700 h-42 w-60 m-2">
		<div class="cardInner">
			<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Block Rewards</h5>
			<p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-sm">
				<input
					type="text"
					id="blockVoiPoolTotal"
					class="w-36 text-right ml-2 bg-gray-50 dark:bg-gray-600"
					bind:value={block_reward_pool}
                    /><span class="text-sm"> / wk</span>
                </p>
			<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Health Rewards</h5>
			<p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-sm">
				<input
					type="text"
					id="healthVoiPoolTotal"
					class="w-36 text-right ml-2 bg-gray-50 dark:bg-gray-600"
					bind:value={health_reward_pool}
				/><span class="text-sm"> / wk</span>
			</p>
		</div>
	</Card>
</div>
<div class="notices">
	<div>
		This website calculates the expected weekly Voi Testnet Token rewards for node operators, based
		on the accepted block rewards proposal located <a
			href="https://docs.google.com/document/d/1tgU9Ytd4YxHGOsnFBIuEV75sclpI92AeYPxVZcBxvE0/edit#heading=h.s8s7iwa3qzls"
			>here</a
		>.
		<span style="font-weight:bold;"
			>Please note that rewards are not official until they are distributed.</span
		>
	</div>
	<br />
	<div>
		<span style="font-weight:bold;"
			>PLEASE BE AWARE that VOI TestNet tokens have no inherent value. The VOI TestNet is a game.
			Chris said it best:</span
		>
		<div class="quote bg-gray-200 dark:bg-gray-600">
			<blockquote>
				"After testnet is over the game will also be over and the points will be tallied. A new
				entity that follows proper roles and regulations will decide the rewards of the game. There
				is a chance they might decide zero, but I believe that would be against their best interest
				and against the mission of Voi."
			</blockquote>
			<cite>- Chris Swenor</cite>
		</div>
	</div>
</div>
{#if dataArrays.length > 0}
	<RewardsTable items={dataArrays} />
{/if}

<style>
	.notices {
		margin: 10px;
		font-size: 14px;
		line-height: 1.5;
	}
	.dashboard {
		margin: 10px;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
	}
	.quote {
		margin: 1rem 0;
		padding: 1rem;
		border-left: 5px solid #007bff;
		font-size: 14px;
	}
	blockquote {
		margin: 0;
		font-size: 1.2rem;
		font-style: italic;
	}
	cite {
		display: block;
		margin-top: 1rem;
		font-size: 1rem;
		font-weight: bold;
		text-align: right;
	}
	select {
		width: 100%;
		max-width: 260px;
		font-size: 16px;
		padding: 10px;
		margin-bottom: 10px;
	}
	input[type='text'] {
		width: 9em;
		max-width: 200px;
		font-size: 16px;
		padding: 10px;
		margin-right: 10px;
	}
	.cardInner {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		transition: all 0.3s ease-in-out;
	}
	/*.cardInner:hover {
		transform: translateY(-5px);
	}*/
	.cardInner h5 {
		font-size: 18px;
		margin-bottom: 5px;
		text-align: center;
	}
	.cardInner p {
		font-size: 24px;
		font-weight: bold;
		text-align: center;
	}
</style>
