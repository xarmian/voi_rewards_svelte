<script lang="ts">
	import type { TransparencyData } from '$lib/types/reports.types';

	let {
		data,
		formatNum
	}: {
		data: TransparencyData;
		formatNum: (val: string, prefix?: string) => string;
	} = $props();
</script>

<!-- Token Supply Summary -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Token Supply</h3>
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Total Supply</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.token_supply_summary.total_supply_voi)} VOI
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
				Circulating Supply
			</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.token_supply_summary.circulating_supply_voi)} VOI
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
				Unlocked Tokens
			</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.token_supply_summary.unlocked_tokens_voi)} VOI
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Locked Tokens</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.token_supply_summary.locked_tokens_voi)} VOI
			</p>
		</div>
	</div>
</div>

<!-- Token Distribution Breakdown -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">
		Token Distribution
	</h3>
	<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
				Community Allocation
			</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.token_distribution_breakdown.community_allocation_voi)} VOI
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
				Market Liquidity
			</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.token_distribution_breakdown.market_liquidity_voi)} VOI
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
				Ecosystem Incentives
			</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.token_distribution_breakdown.ecosystem_incentives_voi)} VOI
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
				Block Authority
			</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.token_distribution_breakdown.block_authority_allocation_voi)} VOI
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
				Other Reserves
			</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.token_distribution_breakdown.other_reserves_voi)} VOI
			</p>
		</div>
	</div>
</div>

<!-- Market Availability -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">
		Market Availability
	</h3>
	<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Tokens on CEX</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.market_availability.tokens_on_cex_voi)} VOI
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Tokens on DEX</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.market_availability.tokens_on_dex_voi)} VOI
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
				Total Liquidity
			</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.market_availability.total_liquidity_voi)} VOI
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">FDV</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.market_availability.fdv_usd, '$')}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">TDV</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.market_availability.tdv_usd, '$')}
			</p>
		</div>
	</div>
</div>

<!-- Community & Ecosystem Payments -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">
		Community Payments
	</h3>
	{#if data.community_ecosystem_payments.length > 0}
		<div class="overflow-x-auto">
			<table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
				<thead
					class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400"
				>
					<tr>
						<th scope="col" class="px-4 py-3">Recipient</th>
						<th scope="col" class="px-4 py-3">Amount (VOI)</th>
						<th scope="col" class="px-4 py-3">Purpose</th>
						<th scope="col" class="px-4 py-3">Date</th>
					</tr>
				</thead>
				<tbody>
					{#each data.community_ecosystem_payments as payment (payment.recipient + payment.date)}
						<tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
							<td class="px-4 py-3 font-medium text-gray-900 dark:text-white">
								{payment.recipient}
							</td>
							<td class="px-4 py-3">{formatNum(payment.amount_voi)}</td>
							<td class="px-4 py-3">{payment.purpose}</td>
							<td class="px-4 py-3">{payment.date}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="text-center text-gray-500 dark:text-gray-400 py-8">
			No community payments recorded for this period.
		</p>
	{/if}
</div>

<!-- Limitations & Disclaimers -->
{#if data.limitations_disclaimers}
	<div class="mb-6 sm:mb-8">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">
			Limitations & Disclaimers
		</h3>
		<p class="text-gray-600 dark:text-gray-400 whitespace-pre-line">
			{data.limitations_disclaimers}
		</p>
	</div>
{/if}

<!-- Summary -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Summary</h3>
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
				Supply Transparency
			</h3>
			<p class="text-sm font-semibold text-gray-900 dark:text-white">
				{data.summary.supply_transparency}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
				Authority Spend
			</h3>
			<p class="text-sm font-semibold text-gray-900 dark:text-white">
				{data.summary.authority_spend_activity}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
				Community Funding Health
			</h3>
			<p class="text-sm font-semibold text-gray-900 dark:text-white">
				{data.summary.community_funding_health}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
				Risks / Concerns
			</h3>
			<p class="text-sm font-semibold text-gray-900 dark:text-white">
				{data.summary.risks_or_concerns}
			</p>
		</div>
	</div>
</div>
