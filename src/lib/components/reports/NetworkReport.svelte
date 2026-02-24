<script lang="ts">
	import type { NetworkData } from '$lib/types/reports.types';

	let {
		data,
		formatNum
	}: {
		data: NetworkData;
		formatNum: (val: string, prefix?: string) => string;
	} = $props();

	const txBreakdownLabels: Record<string, string> = {
		payment_pay: 'Payment (pay)',
		application_call_appl: 'App Call (appl)',
		asset_transfer_axfer: 'Asset Transfer (axfer)',
		asset_config_acfg: 'Asset Config (acfg)',
		asset_freeze_afrz: 'Asset Freeze (afrz)',
		application_create: 'App Create',
		application_update: 'App Update',
		application_delete: 'App Delete',
		inner_transactions: 'Inner Transactions'
	};
</script>

<!-- Market Snapshot -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Market Snapshot</h3>
	<div class="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">VOI Price</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.market_snapshot.voi_price_usd, '$')}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Market Cap</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.market_snapshot.market_cap_usd, '$')}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Avg Block Time</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.market_snapshot.avg_block_time_seconds)}s
			</p>
		</div>
	</div>
</div>

<!-- Network Nodes -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Network Nodes</h3>
	<div class="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Participating Nodes</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.network_nodes.participating_nodes_or_wallets)}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Online Stake</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.network_nodes.eligible_online_stake_voi)} VOI
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Weekly Rewards</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.network_nodes.weekly_staking_rewards_voi)} VOI
			</p>
		</div>
	</div>
	{#if data.network_nodes.insight}
		<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">{data.network_nodes.insight}</p>
	{/if}
</div>

<!-- Relay Health -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Relay Health</h3>
	<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Total Relays</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.relay_health_changes.total_relays)}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Qualified</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.relay_health_changes.qualified_relays)}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Added</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.relay_health_changes.relays_added)}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Removed</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.relay_health_changes.relays_removed)}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Total Peers</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.relay_health_changes.total_possible_peers)}
			</p>
		</div>
	</div>
	{#if data.relay_health_changes.key_takeaway}
		<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
			{data.relay_health_changes.key_takeaway}
		</p>
	{/if}
</div>

<!-- Transaction Breakdown -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Transaction Breakdown</h3>
	<div class="overflow-x-auto">
		<table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
			<thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
				<tr>
					<th scope="col" class="px-4 py-3">Transaction Type</th>
					<th scope="col" class="px-4 py-3 text-right">Count</th>
				</tr>
			</thead>
			<tbody>
				{#each Object.entries(txBreakdownLabels) as [key, label] (key)}
					<tr class="border-b dark:border-gray-700 bg-white dark:bg-gray-800">
						<td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{label}</td>
						<td class="px-4 py-3 text-right">
							{formatNum(
								data.transaction_breakdown[key as keyof typeof data.transaction_breakdown]
							)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<!-- Profitability -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">
		Profitability at a Glance
	</h3>
	<div class="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Node Cost/mo</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.profitability_at_a_glance.self_hosted_node_cost_usd, '$')}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Stake Required</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.profitability_at_a_glance.stake_required_voi)} VOI
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Monthly Profit</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.profitability_at_a_glance.estimated_monthly_profit_usd, '$')}
			</p>
		</div>
	</div>
	{#if data.profitability_at_a_glance.key_takeaway}
		<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
			{data.profitability_at_a_glance.key_takeaway}
		</p>
	{/if}
</div>

<!-- Summary -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Summary</h3>
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Network Stability</h3>
			<p class="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
				{data.summary.network_stability}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Participation Trend</h3>
			<p class="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
				{data.summary.participation_trend}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Transaction Activity</h3>
			<p class="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
				{data.summary.transaction_activity}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Immediate Risks</h3>
			<p class="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
				{data.summary.immediate_risks}
			</p>
		</div>
	</div>
</div>
