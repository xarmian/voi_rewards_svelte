<script lang="ts">
	import type { FungibleTokenType, LPToken } from '$lib/types/assets';
	import { isLPToken } from '$lib/tokens/lpStats';
	import type { Transfer } from '$lib/services/tokenTransfers';
	import { Tooltip } from 'flowbite-svelte';

	let {
		token,
		transfers,
		isLoading,
		showLpStats,
		currentPoolBalance,
		formatNumber,
		totalTokenAAdded,
		totalTokenBAdded,
		totalTokenARemoved,
		totalTokenBRemoved,
		profitLossA,
		profitLossB,
		profitLossPercentA,
		profitLossPercentB,
		totalProfitLossInA,
		totalProfitLossInB,
		totalProfitLossPercentInA,
		totalProfitLossPercentInB
	}: {
		token: FungibleTokenType | LPToken;
		transfers: Transfer[];
		isLoading: boolean;
		showLpStats: boolean;
		currentPoolBalance: { tokenA: number; tokenB: number } | null;
		formatNumber: (value: number, decimals: number) => string;
		totalTokenAAdded: number;
		totalTokenBAdded: number;
		totalTokenARemoved: number;
		totalTokenBRemoved: number;
		profitLossA: number;
		profitLossB: number;
		profitLossPercentA: number;
		profitLossPercentB: number;
		totalProfitLossInA: number;
		totalProfitLossInB: number;
		totalProfitLossPercentInA: number;
		totalProfitLossPercentInB: number;
	} = $props();
</script>

<!-- LP Statistics Content - Now inside the scrollable area -->
{#if isLPToken(token) && token.poolInfo && showLpStats}
	<div class="mb-4 animate-slideDown">
		{#if transfers.some((t) => t.isLpExchange)}
			<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
				<!-- Token A Statistics -->
				<div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
					<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
						{token.poolInfo.tokASymbol} Statistics
					</h4>
					<div class="space-y-1 text-sm">
						<div class="flex justify-between">
							<span class="text-gray-600 dark:text-gray-400">
								Total Added
								<Tooltip triggeredBy="#total-added-info"
									>The aggregate amount you've added of each token to the pool</Tooltip
								>
								<i
									id="total-added-info"
									class="fas fa-info-circle text-xs ml-1 text-gray-400 hover:text-gray-500 cursor-help"
								></i>
							</span>
							<span class="font-medium"
								>{formatNumber(totalTokenAAdded, token.poolInfo.tokADecimals)}
								{token.poolInfo.tokASymbol}</span
							>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600 dark:text-gray-400">
								Total Removed
								<Tooltip triggeredBy="#total-removed-info"
									>The aggregate amount you've removed of each token from the pool</Tooltip
								>
								<i
									id="total-removed-info"
									class="fas fa-info-circle text-xs ml-1 text-gray-400 hover:text-gray-500 cursor-help"
								></i>
							</span>
							<span class="font-medium"
								>{formatNumber(totalTokenARemoved, token.poolInfo.tokADecimals)}
								{token.poolInfo.tokASymbol}</span
							>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600 dark:text-gray-400">
								Net Contribution
								<Tooltip triggeredBy="#net-contribution-info"
									>Total added minus total removed</Tooltip
								>
								<i
									id="net-contribution-info"
									class="fas fa-info-circle text-xs ml-1 text-gray-400 hover:text-gray-500 cursor-help"
								></i>
							</span>
							<span class="font-medium"
								>{formatNumber(totalTokenAAdded - totalTokenARemoved, token.poolInfo.tokADecimals)}
								{token.poolInfo.tokASymbol}</span
							>
						</div>
						{#if currentPoolBalance}
							<div class="border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
								<div class="flex justify-between">
									<span class="text-gray-600 dark:text-gray-400">
										Current Value
										<Tooltip triggeredBy="#current-value-info"
											>How much of each token you currently have in the pool (i.e. if you withdrew
											everything)</Tooltip
										>
										<i
											id="current-value-info"
											class="fas fa-info-circle text-xs ml-1 text-gray-400 hover:text-gray-500 cursor-help"
										></i>
									</span>
									<span class="font-medium"
										>{formatNumber(currentPoolBalance.tokenA, token.poolInfo.tokADecimals)}
										{token.poolInfo.tokASymbol}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-600 dark:text-gray-400">
										Token P/L
										<Tooltip triggeredBy="#token-pl-info">Amount gained/lost of each token</Tooltip>
										<i
											id="token-pl-info"
											class="fas fa-info-circle text-xs ml-1 text-gray-400 hover:text-gray-500 cursor-help"
										></i>
									</span>
									<span
										class={profitLossA >= 0
											? 'text-green-600 dark:text-green-400'
											: 'text-red-600 dark:text-red-400'}
									>
										{profitLossA >= 0 ? '+' : ''}{formatNumber(
											profitLossA,
											token.poolInfo.tokADecimals
										)}
										{token.poolInfo.tokASymbol}
										({profitLossPercentA >= 0 ? '+' : ''}{formatNumber(profitLossPercentA, 2)}%)
									</span>
								</div>

								<!-- New: Total P/L converted to token A -->
								<div
									class="flex justify-between font-medium border-t border-gray-200 dark:border-gray-600 pt-1 mt-1"
								>
									<span class="text-gray-700 dark:text-gray-300">
										Combined P/L in {token.poolInfo.tokASymbol}
										<Tooltip triggeredBy="#combined-pl-info"
											>If you were to convert all of one token to the other, this is your Profit or
											Loss as measured in a single token</Tooltip
										>
										<i
											id="combined-pl-info"
											class="fas fa-info-circle text-xs ml-1 text-gray-400 hover:text-gray-500 cursor-help"
										></i>
									</span>
									<span
										class={totalProfitLossInA >= 0
											? 'text-green-600 dark:text-green-400'
											: 'text-red-600 dark:text-red-400'}
									>
										{totalProfitLossInA >= 0 ? '+' : ''}{formatNumber(
											totalProfitLossInA,
											token.poolInfo.tokADecimals
										)}
										{token.poolInfo.tokASymbol}
										({totalProfitLossPercentInA >= 0 ? '+' : ''}{formatNumber(
											totalProfitLossPercentInA,
											2
										)}%)
									</span>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Token B Statistics -->
				<div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
					<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
						{token.poolInfo.tokBSymbol} Statistics
					</h4>
					<div class="space-y-1 text-sm">
						<div class="flex justify-between">
							<span class="text-gray-600 dark:text-gray-400">
								Total Added
								<Tooltip triggeredBy="#total-added-info"
									>The aggregate amount you've added of each token to the pool</Tooltip
								>
								<i
									id="total-added-info"
									class="fas fa-info-circle text-xs ml-1 text-gray-400 hover:text-gray-500 cursor-help"
								></i>
							</span>
							<span class="font-medium"
								>{formatNumber(totalTokenBAdded, token.poolInfo.tokBDecimals)}
								{token.poolInfo.tokBSymbol}</span
							>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600 dark:text-gray-400">
								Total Removed
								<Tooltip triggeredBy="#total-removed-info"
									>The aggregate amount you've removed of each token from the pool</Tooltip
								>
								<i
									id="total-removed-info"
									class="fas fa-info-circle text-xs ml-1 text-gray-400 hover:text-gray-500 cursor-help"
								></i>
							</span>
							<span class="font-medium"
								>{formatNumber(totalTokenBRemoved, token.poolInfo.tokBDecimals)}
								{token.poolInfo.tokBSymbol}</span
							>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600 dark:text-gray-400">
								Net Contribution
								<Tooltip triggeredBy="#net-contribution-info"
									>Total added minus total removed</Tooltip
								>
								<i
									id="net-contribution-info"
									class="fas fa-info-circle text-xs ml-1 text-gray-400 hover:text-gray-500 cursor-help"
								></i>
							</span>
							<span class="font-medium"
								>{formatNumber(totalTokenBAdded - totalTokenBRemoved, token.poolInfo.tokBDecimals)}
								{token.poolInfo.tokBSymbol}</span
							>
						</div>
						{#if currentPoolBalance}
							<div class="border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
								<div class="flex justify-between">
									<span class="text-gray-600 dark:text-gray-400">
										Current Value
										<Tooltip triggeredBy="#current-value-info"
											>How much of each token you currently have in the pool (i.e. if you withdrew
											everything)</Tooltip
										>
										<i
											id="current-value-info"
											class="fas fa-info-circle text-xs ml-1 text-gray-400 hover:text-gray-500 cursor-help"
										></i>
									</span>
									<span class="font-medium"
										>{formatNumber(currentPoolBalance.tokenB, token.poolInfo.tokBDecimals)}
										{token.poolInfo.tokBSymbol}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-600 dark:text-gray-400">
										Token P/L
										<Tooltip triggeredBy="#token-pl-info">Amount gained/lost of each token</Tooltip>
										<i
											id="token-pl-info"
											class="fas fa-info-circle text-xs ml-1 text-gray-400 hover:text-gray-500 cursor-help"
										></i>
									</span>
									<span
										class="font-medium {profitLossB >= 0
											? 'text-green-600 dark:text-green-400'
											: 'text-red-600 dark:text-red-400'}"
									>
										{profitLossB >= 0 ? '+' : ''}{formatNumber(
											profitLossB,
											token.poolInfo.tokBDecimals
										)}
										{token.poolInfo.tokBSymbol}
										({profitLossB >= 0 ? '+' : ''}{formatNumber(profitLossPercentB, 2)}%)
									</span>
								</div>

								<!-- New: Total P/L converted to token B -->
								<div
									class="flex justify-between font-medium border-t border-gray-200 dark:border-gray-600 pt-1 mt-1"
								>
									<span class="text-gray-700 dark:text-gray-300">
										Combined P/L in {token.poolInfo.tokBSymbol}
										<Tooltip triggeredBy="#combined-pl-info"
											>If you were to convert all of one token to the other, this is your Profit or
											Loss as measured in a single token</Tooltip
										>
										<i
											id="combined-pl-info"
											class="fas fa-info-circle text-xs ml-1 text-gray-400 hover:text-gray-500 cursor-help"
										></i>
									</span>
									<span
										class={totalProfitLossInB >= 0
											? 'text-green-600 dark:text-green-400'
											: 'text-red-600 dark:text-red-400'}
									>
										{totalProfitLossInB >= 0 ? '+' : ''}{formatNumber(
											totalProfitLossInB,
											token.poolInfo.tokBDecimals
										)}
										{token.poolInfo.tokBSymbol}
										({totalProfitLossPercentInB >= 0 ? '+' : ''}{formatNumber(
											totalProfitLossPercentInB,
											2
										)}%)
									</span>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Note about calculations -->
			<div class="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
				Note: These statistics are calculated based on your transaction history. Profit/loss
				calculations include fees, impermanent loss, and rewards.
			</div>
		{:else if !isLoading}
			<div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
				<div class="text-gray-500 dark:text-gray-400 mb-2">
					<i class="fas fa-info-circle text-xl"></i>
				</div>
				<p class="text-gray-700 dark:text-gray-300">No LP transactions found in your history.</p>
				<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
					Statistics will appear here once you've added or removed liquidity from this pool.
				</p>
				{#if currentPoolBalance}
					<div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
						<p class="text-sm font-medium text-gray-700 dark:text-gray-300">
							Current Pool Balance:
						</p>
						<div class="flex justify-center gap-4 mt-2">
							<div class="text-sm">
								<span class="font-medium"
									>{formatNumber(currentPoolBalance.tokenA, token.poolInfo.tokADecimals)}</span
								>
								<span class="text-gray-500 dark:text-gray-400">{token.poolInfo.tokASymbol}</span>
							</div>
							<div class="text-sm">
								<span class="font-medium"
									>{formatNumber(currentPoolBalance.tokenB, token.poolInfo.tokBDecimals)}</span
								>
								<span class="text-gray-500 dark:text-gray-400">{token.poolInfo.tokBSymbol}</span>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.animate-slideDown {
		animation: slideDown 0.2s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
