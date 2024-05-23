<script lang="ts">
	import { Card } from 'flowbite-svelte';
	import { onMount } from 'svelte';
	import RewardsTable from './RewardsTable.svelte';
	import { rewardParams } from '../../stores/dataTable';
    import { algodClient } from '$lib/utils/algod';
	import WalletSearch from '$lib/component/WalletSearch.svelte';
	import { goto } from '$app/navigation';
	import { compareVersions } from 'compare-versions';

	$: totalBlocks = 0;
	$: totalWallets = 0;
	$: block_height = 0;
	$: block_height_timestamp = '';
	$: totalHealthyNodes = 0;
	$: totalEmptyNodes = 0;
	$: totalExtraNodes = 0;
	$: minimumAlgod = '3.0.0';
	$: selectedDate = '';
	$: dataArrays = [];
	$: MIN_ALGOD_VERSION = '3.0.0';

	let supply: any;
	$: supply = {};

	const loadDashboardData = async () => {
		const url = `https://api.voirewards.com/proposers/index_p2.php`;

		// reinitialize totals
		totalWallets = 0;
		totalBlocks = 0;
		block_height = 0;

		fetch(url, { cache: 'no-store' })
			.then((response) => response.json())
			.then(async (data) => {
				MIN_ALGOD_VERSION = data.minimum_algod;

				// Sort the data by block count
				data.data.sort((a: any, b: any) => b.block_count - a.block_count);
				dataArrays = data.data;

				//console.log(data.data);

                dataArrays.forEach((row: any) => {
                    totalWallets++;

					let nodeVer = '0';
					if (row.nodes) {
						for (let j = 0; j < row.nodes.length; j++) {
							const node = row.nodes[j];
							if (node.ver && compareVersions(node.ver,nodeVer) >= 0) {
								nodeVer = node.ver;
							}
						}
					}

					if (nodeVer && (compareVersions(nodeVer,MIN_ALGOD_VERSION) >= 0)) {
						totalBlocks += row.block_count;
					}
					else {
						row.block_count = 0;
					}
				});

				block_height = data.block_height;
				block_height_timestamp = new Date(data.max_timestamp).toLocaleString('en-US', {
					timeZone: 'UTC'
				});
				totalHealthyNodes = data.healthy_node_count;
				totalEmptyNodes = data.empty_node_count;
				totalExtraNodes = data.extra_node_count;
				minimumAlgod = data.minimum_algod;
			});
	};

	onMount(async () => {
		loadDashboardData();

		// get online stake
		supply = await algodClient.supply().do();
	});

	$: {
		rewardParams.set({
			block_reward_pool: 0,
			health_reward_pool: 0,
			total_blocks: totalBlocks,
			total_healthy_nodes: totalHealthyNodes - totalEmptyNodes,
			total_extra_nodes: totalExtraNodes,
			minimum_algod: minimumAlgod,
		});
	}
</script>

<div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 m-4" role="alert">
	<p class="font-bold">Notice:</p>
	<p>Phase 1 of the Voi Incentivized Testnet has ended. See our <a href="/phase1" class="underline text-yellow-700">Phase 1</a> page for details.</p>
	<p>Visit our <a href="/phase2" class="underline text-yellow-700">Phase 2</a> page for details about Phase 2 Quests.</p>
	<p>This page now shows cumulative points toward Phase 2 for running a Healthy node. Visit the <a href="https://discord.gg/vnFbrJrHeW" target="_blank" class="underline text-yellow-700">Voi Discord</a>
		for more information.
	</p>
</div>
<div class="text-center">
	<WalletSearch onSubmit={(addr) => goto(`/wallet/${addr.toUpperCase()}`)} loadPreviousValue={false} />
</div>
<div class="dashboard justify-evenly">
	<Card class="bg-gray-100 dark:bg-gray-700 h-42 w-60 m-2">
		<div class="cardInner">
			<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
				Min Algod Version
			</h5>
			<p class="font-normal text-gray-700 dark:text-gray-400 leading-tight text-lg">
				{MIN_ALGOD_VERSION == '3.0.0' ? '...Loading...' : MIN_ALGOD_VERSION}
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
</div>
<div class="notices">
	<div class="flex flex-col place-items-center">
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
		<div class="font-bold text-red-900 dark:text-red-400 text-lg text-center">
			Phase 2 Node points are cumulative. Nodes will accrue one point per healthy week.
		</div>
		<div class='w-full md:w-3/4'>For Voi Testnet Phase 2, nodes will be rewarded based on the number of weeks the node is healthy (score >5.0) during the Phase 2 time period.</div>
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
