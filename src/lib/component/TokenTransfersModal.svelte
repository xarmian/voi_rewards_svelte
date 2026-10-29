<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { FungibleTokenType, LPToken } from '$lib/types/assets';
	import { formatAddress } from '$lib/utils';
	import {
		fetchTokenTransfers,
		fetchCurrentPoolBalance as getCurrentPoolBalance,
		type Transfer
	} from '$lib/services/tokenTransfers';
	import {
		calculateLPStatistics as getLPStatistics,
		calculateRunningBalance,
		formatChange,
		isLPToken
	} from '$lib/tokens/lpStats';
	import { A, Tooltip } from 'flowbite-svelte';

	export let open = false;
	export let token: FungibleTokenType | LPToken;
	export let walletId: string;
	export let currentPoolBalance: { tokenA: number; tokenB: number } | null = null;

	let transfers: Transfer[] = [];
	let filteredTransfers: Transfer[] = [];
	let isLoading = false;
	let error: string | null = null;
	let offset = 0;
	let limit = 50;
	let hasMore = true;
	let expandedRows = new Set<string>();
	let nextToken: string | undefined = undefined;

	// Filter states
	let fromAddress = '';
	let toAddress = '';
	let note = '';
	let showMobileFilters = false;
	let showFeeTransactions = false;
	let showLPExchangeDetails = true;

	// LP Statistics
	let showLpStats = true; // Default to showing LP stats
	let totalTokenAAdded = 0;
	let totalTokenBAdded = 0;
	let totalTokenARemoved = 0;
	let totalTokenBRemoved = 0;
	let profitLossA = 0;
	let profitLossB = 0;
	let profitLossPercentA = 0;
	let profitLossPercentB = 0;
	let totalProfitLossA = 0; // Total profit/loss including removed tokens
	let totalProfitLossB = 0; // Total profit/loss including removed tokens
	let totalProfitLossInA = 0; // Total P/L converted to token A
	let totalProfitLossInB = 0; // Total P/L converted to token B
	let totalProfitLossPercentInA = 0; // Total P/L percentage in token A
	let totalProfitLossPercentInB = 0; // Total P/L percentage in token B

	function toggleRow(transactionId: string) {
		if (expandedRows.has(transactionId)) {
			expandedRows.delete(transactionId);
		} else {
			expandedRows.add(transactionId);
		}
		expandedRows = expandedRows; // Trigger reactivity
	}

	function fetchCurrentPoolBalance() {
		const balance = getCurrentPoolBalance(token, currentPoolBalance);
		if (balance instanceof Promise) {
			void balance.then((value) => {
				if (value) currentPoolBalance = value;
			});
		} else if (balance) {
			currentPoolBalance = balance;
		}
	}

	onMount(() => {
		if (document) {
			document.body.style.overflow = 'hidden';
		}

		// If this is an LP token, fetch the current pool balance
		if (isLPToken(token) && token.poolInfo) {
			fetchCurrentPoolBalance();
		}
	});

	onDestroy(() => {
		if (document) {
			document.body.style.overflow = 'unset';
		}
	});

	async function fetchTransfers(append = false) {
		if (isLoading) return;
		isLoading = true;
		error = null;
		try {
			const result = await fetchTokenTransfers({
				token,
				walletId,
				nextToken,
				hasMore,
				append,
				limit,
				offset,
				transfers,
				onPagination: (pagination) => {
					nextToken = pagination.nextToken;
					hasMore = pagination.hasMore;
				}
			});
			if (result.transfers.length === 0) return;
			if (append) {
				transfers = [...transfers, ...result.transfers];
			} else {
				transfers = result.transfers;
			}
			applyFilters();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to fetch transfers';
			hasMore = false;
		} finally {
			isLoading = false;
		}
	}

	function applyFilters() {
		filteredTransfers = transfers.filter((transfer) => {
			// First apply fee transaction filter
			if (!showFeeTransactions && transfer.type === 'fee') {
				return false;
			}

			const matchesFromAddress =
				!fromAddress ||
				transfer.from.toLowerCase().includes(fromAddress.toLowerCase()) ||
				transfer.from_name?.toLowerCase().includes(fromAddress.toLowerCase());
			const matchesToAddress =
				!toAddress ||
				transfer.to.toLowerCase().includes(toAddress.toLowerCase()) ||
				transfer.to_name?.toLowerCase().includes(toAddress.toLowerCase());
			const matchesNote =
				!note || (transfer.note?.toLowerCase().includes(note.toLowerCase()) ?? false);
			return matchesFromAddress && matchesToAddress && matchesNote;
		});
	}

	function handleScroll(e: Event) {
		const target = e.target as HTMLDivElement;
		const bottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;

		if (bottom && !isLoading && hasMore) {
			if (token.type === 'arc200') {
				offset += limit;
			}
			fetchTransfers(true);
		}
	}

	function formatTimestamp(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleString();
	}

	function getPoolUrl(): string | undefined {
		if (
			!isLPToken(token) ||
			!token.poolInfo ||
			!token.poolInfo.provider ||
			!token.poolInfo.poolId
		) {
			return undefined;
		}

		if (token.poolInfo.provider === 'humble') {
			return `https://voi.humble.sh/#/pool/details?poolId=${token.poolInfo.poolId}`;
		} else if (token.poolInfo.provider === 'nomadex') {
			// Check if we have tokAType and tokBType
			if (
				token.poolInfo.tokAType &&
				token.poolInfo.tokBType &&
				token.poolInfo.tokAId &&
				token.poolInfo.tokBId
			) {
				return `https://voi.nomadex.app/${token.poolInfo.tokAType}/${token.poolInfo.tokAId}/${token.poolInfo.tokBType}/${token.poolInfo.tokBId}`;
			} else {
				return `https://voi.nomadex.app/liquidity/${token.poolInfo.poolId}`;
			}
		}

		return undefined;
	}

	function calculateLPStatistics() {
		if (!isLPToken(token) || !token.poolInfo) return;
		if (!currentPoolBalance) fetchCurrentPoolBalance();
		const stats = getLPStatistics(transfers, token, currentPoolBalance);
		if (!stats) return;
		if (stats.totalTokenAAdded !== undefined) totalTokenAAdded = stats.totalTokenAAdded;
		if (stats.totalTokenBAdded !== undefined) totalTokenBAdded = stats.totalTokenBAdded;
		if (stats.totalTokenARemoved !== undefined) totalTokenARemoved = stats.totalTokenARemoved;
		if (stats.totalTokenBRemoved !== undefined) totalTokenBRemoved = stats.totalTokenBRemoved;
		if (stats.profitLossA !== undefined) profitLossA = stats.profitLossA;
		if (stats.profitLossB !== undefined) profitLossB = stats.profitLossB;
		if (stats.profitLossPercentA !== undefined) profitLossPercentA = stats.profitLossPercentA;
		if (stats.profitLossPercentB !== undefined) profitLossPercentB = stats.profitLossPercentB;
		if (stats.totalProfitLossA !== undefined) totalProfitLossA = stats.totalProfitLossA;
		if (stats.totalProfitLossB !== undefined) totalProfitLossB = stats.totalProfitLossB;
		if (stats.totalProfitLossInA !== undefined) totalProfitLossInA = stats.totalProfitLossInA;
		if (stats.totalProfitLossInB !== undefined) totalProfitLossInB = stats.totalProfitLossInB;
		if (stats.totalProfitLossPercentInA !== undefined)
			totalProfitLossPercentInA = stats.totalProfitLossPercentInA;
		if (stats.totalProfitLossPercentInB !== undefined)
			totalProfitLossPercentInB = stats.totalProfitLossPercentInB;
	}

	function formatNumber(value: number, decimals: number): string {
		if (isNaN(value) || !isFinite(value)) return '0';

		try {
			return value.toLocaleString('en-US', {
				minimumFractionDigits: 0,
				maximumFractionDigits: decimals
			});
		} catch (error) {
			console.error('Error formatting number:', error);
			return value.toString();
		}
	}

	$: if (open) {
		offset = 0;
		nextToken = undefined;
		transfers = [];
		filteredTransfers = [];
		fetchTransfers();
	}

	$: {
		fromAddress;
		toAddress;
		note;
		showFeeTransactions;
		showLPExchangeDetails;
		applyFilters();
	}

	// Recalculate LP statistics when transfers change
	$: if (transfers.length > 0 && isLPToken(token)) {
		calculateLPStatistics();
	}
</script>

{#if open}
	<div
		class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto"
	>
		<div class="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
			<div
				class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10"
			>
				<div>
					<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
						{token.symbol} Transfers
					</h2>
					<div class="text-sm text-gray-600 dark:text-gray-300 mt-1">
						Current Balance: <span class="font-medium"
							>{token.balance / Math.pow(10, token.decimals)} {token.symbol}</span
						>
					</div>
				</div>
				<button
					class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
					on:click={() => (open = false)}
					aria-label="Close"
				>
					<i class="fas fa-times"></i>
				</button>
			</div>

			<!-- Filters Section -->
			<div class="p-4 border-b border-gray-200 dark:border-gray-700">
				<!-- Desktop Filters -->
				<div
					class="hidden md:grid grid-cols-{isLPToken(token)
						? '4'
						: token.type === 'native'
							? '4'
							: '3'} gap-4"
				>
					<div class="space-y-2">
						<label for="fromAddress" class="text-sm font-medium text-gray-700 dark:text-gray-300"
							>From Address</label
						>
						<input
							type="text"
							id="fromAddress"
							bind:value={fromAddress}
							placeholder="Search from address"
							class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
						/>
					</div>
					<div class="space-y-2">
						<label for="toAddress" class="text-sm font-medium text-gray-700 dark:text-gray-300"
							>To Address</label
						>
						<input
							type="text"
							id="toAddress"
							bind:value={toAddress}
							placeholder="Search to address"
							class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
						/>
					</div>
					<div class="space-y-2">
						<label for="note" class="text-sm font-medium text-gray-700 dark:text-gray-300"
							>Note</label
						>
						<input
							type="text"
							id="note"
							bind:value={note}
							placeholder="Search note"
							class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
						/>
					</div>
					{#if token.type === 'native'}
						<div class="space-y-2">
							<label
								for="showFeeTransactions"
								class="text-sm font-medium text-gray-700 dark:text-gray-300"
								>Show Fee Transactions</label
							>
							<div class="flex items-center">
								<button
									class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-full text-left flex justify-between items-center {showFeeTransactions
										? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
										: 'bg-gray-50 dark:bg-gray-700/50'}"
									on:click={() => (showFeeTransactions = !showFeeTransactions)}
								>
									<span class="text-sm text-gray-700 dark:text-gray-300"
										>{showFeeTransactions ? 'Showing' : 'Hidden'}</span
									>
									<i
										class="fas fa-toggle-{showFeeTransactions
											? 'on text-blue-500'
											: 'off text-gray-400'}"
									></i>
								</button>
							</div>
						</div>
					{:else if isLPToken(token)}
						<div class="space-y-2">
							<label
								for="showLPExchangeDetails"
								class="text-sm font-medium text-gray-700 dark:text-gray-300"
								>Show LP Exchange Details</label
							>
							<div class="flex items-center">
								<button
									class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-full text-left flex justify-between items-center {showLPExchangeDetails
										? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
										: 'bg-gray-50 dark:bg-gray-700/50'}"
									on:click={() => (showLPExchangeDetails = !showLPExchangeDetails)}
								>
									<span class="text-sm text-gray-700 dark:text-gray-300"
										>{showLPExchangeDetails ? 'Showing' : 'Hidden'}</span
									>
									<i
										class="fas fa-toggle-{showLPExchangeDetails
											? 'on text-blue-500'
											: 'off text-gray-400'}"
									></i>
								</button>
							</div>
						</div>
					{/if}
				</div>

				<!-- Mobile Filters -->
				<div class="md:hidden">
					<button
						class="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
						on:click={() => (showMobileFilters = !showMobileFilters)}
					>
						<span>Filters</span>
						<i class="fas fa-{showMobileFilters ? 'chevron-up' : 'chevron-down'}"></i>
					</button>

					{#if showMobileFilters}
						<div class="mt-2 space-y-2 animate-slideDown">
							<div class="relative">
								<input
									type="text"
									bind:value={fromAddress}
									placeholder="From address"
									class="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
								/>
								<i class="fas fa-user absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
							</div>
							<div class="relative">
								<input
									type="text"
									bind:value={toAddress}
									placeholder="To address"
									class="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
								/>
								<i class="fas fa-user absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
							</div>
							<div class="relative">
								<input
									type="text"
									bind:value={note}
									placeholder="Search note"
									class="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
								/>
								<i class="fas fa-note-sticky absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
								></i>
							</div>
							{#if token.type === 'native'}
								<button
									class="w-full px-4 py-2 text-left text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md flex justify-between items-center {showFeeTransactions
										? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
										: 'bg-gray-50 dark:bg-gray-700/50'}"
									on:click={() => (showFeeTransactions = !showFeeTransactions)}
								>
									<span class="text-gray-700 dark:text-gray-300">Show Fee Transactions</span>
									<i
										class="fas fa-toggle-{showFeeTransactions
											? 'on text-blue-500'
											: 'off text-gray-400'}"
									></i>
								</button>
							{:else if isLPToken(token)}
								<button
									class="w-full px-4 py-2 text-left text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md flex justify-between items-center {showLPExchangeDetails
										? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
										: 'bg-gray-50 dark:bg-gray-700/50'}"
									on:click={() => (showLPExchangeDetails = !showLPExchangeDetails)}
								>
									<span class="text-gray-700 dark:text-gray-300">Show LP Exchange Details</span>
									<i
										class="fas fa-toggle-{showLPExchangeDetails
											? 'on text-blue-500'
											: 'off text-gray-400'}"
									></i>
								</button>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- Main scrollable content area -->
			<div
				class="flex-1 overflow-auto p-4"
				on:scroll={handleScroll}
				style="max-height: calc(90vh - {isLPToken(token) ? '220px' : '180px'}); min-height: 250px;"
			>
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
												>{formatNumber(
													totalTokenAAdded - totalTokenARemoved,
													token.poolInfo.tokADecimals
												)}
												{token.poolInfo.tokASymbol}</span
											>
										</div>
										{#if currentPoolBalance}
											<div class="border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
												<div class="flex justify-between">
													<span class="text-gray-600 dark:text-gray-400">
														Current Value
														<Tooltip triggeredBy="#current-value-info"
															>How much of each token you currently have in the pool (i.e. if you
															withdrew everything)</Tooltip
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
														<Tooltip triggeredBy="#token-pl-info"
															>Amount gained/lost of each token</Tooltip
														>
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
														({profitLossPercentA >= 0 ? '+' : ''}{formatNumber(
															profitLossPercentA,
															2
														)}%)
													</span>
												</div>

												<!-- New: Total P/L converted to token A -->
												<div
													class="flex justify-between font-medium border-t border-gray-200 dark:border-gray-600 pt-1 mt-1"
												>
													<span class="text-gray-700 dark:text-gray-300">
														Combined P/L in {token.poolInfo.tokASymbol}
														<Tooltip triggeredBy="#combined-pl-info"
															>If you were to convert all of one token to the other, this is your
															Profit or Loss as measured in a single token</Tooltip
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
												>{formatNumber(
													totalTokenBAdded - totalTokenBRemoved,
													token.poolInfo.tokBDecimals
												)}
												{token.poolInfo.tokBSymbol}</span
											>
										</div>
										{#if currentPoolBalance}
											<div class="border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
												<div class="flex justify-between">
													<span class="text-gray-600 dark:text-gray-400">
														Current Value
														<Tooltip triggeredBy="#current-value-info"
															>How much of each token you currently have in the pool (i.e. if you
															withdrew everything)</Tooltip
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
														<Tooltip triggeredBy="#token-pl-info"
															>Amount gained/lost of each token</Tooltip
														>
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
															>If you were to convert all of one token to the other, this is your
															Profit or Loss as measured in a single token</Tooltip
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
								<p class="text-gray-700 dark:text-gray-300">
									No LP transactions found in your history.
								</p>
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
													>{formatNumber(
														currentPoolBalance.tokenA,
														token.poolInfo.tokADecimals
													)}</span
												>
												<span class="text-gray-500 dark:text-gray-400"
													>{token.poolInfo.tokASymbol}</span
												>
											</div>
											<div class="text-sm">
												<span class="font-medium"
													>{formatNumber(
														currentPoolBalance.tokenB,
														token.poolInfo.tokBDecimals
													)}</span
												>
												<span class="text-gray-500 dark:text-gray-400"
													>{token.poolInfo.tokBSymbol}</span
												>
											</div>
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				{#if error}
					<div class="text-red-500 text-center py-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
						{error}
					</div>
				{:else if filteredTransfers.length === 0 && !isLoading}
					<div
						class="text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
					>
						No transfers found
					</div>
				{:else}
					<div class="space-y-3">
						{#each filteredTransfers as transfer, index (`${transfer.transactionid}-${transfer.round}-${index}`)}
							<div
								class="bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 {transfer.type ===
								'inner-payment'
									? 'ml-4 border-l-4 border-l-purple-200 dark:border-l-purple-800'
									: ''}"
							>
								<div class="p-3 md:p-4">
									<!-- Mobile Layout -->
									<div class="md:hidden">
										<div class="flex justify-between items-start mb-2">
											<div>
												<div
													class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
												>
													{transfer.amount}
													{token.symbol}
													{#if transfer.type === 'fee'}
														<span
															class="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded-full"
														>
															Fee
														</span>
													{:else if transfer.type === 'inner-payment'}
														<span
															class="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 rounded-full"
														>
															Inner
														</span>
													{:else if transfer.isLpExchange}
														<span
															class="px-2 py-0.5 text-xs font-medium
                                                        {transfer.lpExchangeType === 'add'
																? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
																: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'} rounded-full"
														>
															{transfer.lpExchangeType === 'add'
																? 'Add Liquidity'
																: 'Remove Liquidity'}
														</span>
													{/if}
												</div>
												<div class="text-xs text-gray-500 dark:text-gray-400">
													{formatTimestamp(transfer.timestamp)}
												</div>
											</div>
											<div class="text-right">
												<div class="text-sm">
													<span
														class={`font-medium ${transfer.to === walletId ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
													>
														{formatChange(transfer, token, walletId)}
														{token.symbol}
													</span>
													{#if token.type === 'native' && transfer.type === 'payment' && transfer.fee && transfer.fee > 0 && transfer.from === walletId}
														<div class="text-xs text-gray-500 dark:text-gray-400">
															-{(transfer.fee / Math.pow(10, token.decimals)).toFixed(
																token.decimals
															)}
															{token.symbol} fee
														</div>
													{/if}
												</div>
												<div class="text-xs text-gray-500 dark:text-gray-400">
													Balance: {calculateRunningBalance(
														index,
														token,
														filteredTransfers,
														walletId
													)}
													{token.symbol}
												</div>
											</div>
										</div>
										<div class="space-y-2">
											<div>
												<div class="text-xs text-gray-500 dark:text-gray-400">From</div>
												<a
													href={`https://block.voi.network/explorer/account/${transfer.from}`}
													class="text-blue-500 hover:text-blue-600 transition-colors text-sm block"
													target="_blank"
													rel="noopener noreferrer"
												>
													<div class="break-all">
														{#if transfer.from_name}
															<span class="font-medium">{transfer.from_name}</span>
															<span class="text-gray-500 dark:text-gray-400 ml-1"
																>({formatAddress(transfer.from)})</span
															>
														{:else}
															{formatAddress(transfer.from)}
														{/if}
													</div>
												</a>
											</div>
											<div>
												<div class="text-xs text-gray-500 dark:text-gray-400">To</div>
												<a
													href={`https://block.voi.network/explorer/account/${transfer.to}`}
													class="text-blue-500 hover:text-blue-600 transition-colors text-sm block"
													target="_blank"
													rel="noopener noreferrer"
												>
													<div class="break-all">
														{#if transfer.to_name}
															<span class="font-medium">{transfer.to_name}</span>
															<span class="text-gray-500 dark:text-gray-400 ml-1"
																>({formatAddress(transfer.to)})</span
															>
														{:else}
															{formatAddress(transfer.to)}
														{/if}
													</div>
												</a>
											</div>
										</div>
									</div>

									<!-- Desktop Layout -->
									<div class="hidden md:flex items-start gap-4 md:gap-6">
										<div class="flex-none w-44">
											<div
												class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
											>
												{transfer.amount}
												{token.symbol}
												{#if transfer.type === 'fee'}
													<span
														class="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded-full"
													>
														Fee
													</span>
												{:else if transfer.type === 'inner-payment'}
													<span
														class="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 rounded-full"
													>
														Inner
													</span>
												{/if}
											</div>
											<div class="text-xs text-gray-500 dark:text-gray-400">
												{formatTimestamp(transfer.timestamp)}
											</div>
										</div>

										<div class="flex-1 min-w-0 grid grid-cols-2 gap-2 md:gap-6">
											<div class="min-w-0">
												<div class="text-xs text-gray-500 dark:text-gray-400">From</div>
												<a
													href={`https://block.voi.network/explorer/account/${transfer.from}`}
													class="text-blue-500 hover:text-blue-600 transition-colors text-sm block"
													target="_blank"
													rel="noopener noreferrer"
												>
													<div class="truncate">
														{#if transfer.from_name}
															<span class="font-medium">{transfer.from_name}</span>
															<span class="text-gray-500 dark:text-gray-400 ml-1"
																>({formatAddress(transfer.from)})</span
															>
														{:else}
															{formatAddress(transfer.from)}
														{/if}
													</div>
												</a>
											</div>
											<div class="min-w-0">
												<div class="text-xs text-gray-500 dark:text-gray-400">To</div>
												<a
													href={`https://block.voi.network/explorer/account/${transfer.to}`}
													class="text-blue-500 hover:text-blue-600 transition-colors text-sm block"
													target="_blank"
													rel="noopener noreferrer"
												>
													<div class="truncate">
														{#if transfer.to_name}
															<span class="font-medium">{transfer.to_name}</span>
															<span class="text-gray-500 dark:text-gray-400 ml-1"
																>({formatAddress(transfer.to)})</span
															>
														{:else}
															{formatAddress(transfer.to)}
														{/if}
													</div>
												</a>
											</div>
										</div>

										<div class="flex-none w-44 text-right">
											<div class="text-sm">
												<span
													class={`font-medium ${transfer.to === walletId ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
												>
													{formatChange(transfer, token, walletId)}
													{token.symbol}
												</span>
												{#if token.type === 'native' && transfer.type === 'payment' && transfer.fee && transfer.fee > 0 && transfer.from === walletId}
													<div class="text-xs text-gray-500 dark:text-gray-400">
														-{(transfer.fee / Math.pow(10, token.decimals)).toFixed(token.decimals)}
														{token.symbol} fee
													</div>
												{/if}
											</div>
											<div class="text-xs text-gray-500 dark:text-gray-400">
												Balance: {calculateRunningBalance(
													index,
													token,
													filteredTransfers,
													walletId
												)}
												{token.symbol}
											</div>
										</div>
									</div>

									<!-- Main content area with View link at top-right -->
									<div class="mt-3 border-t border-gray-200 dark:border-gray-600 pt-3">
										<div class="flex justify-between items-start">
											<!-- Left side content (LP Exchange details and/or Note) -->
											<div class="flex-1">
												<!-- LP Exchange Information (conditionally shown) -->
												{#if transfer.isLpExchange && transfer.exchangedTokens && showLPExchangeDetails}
													<div class="flex flex-col md:flex-row gap-2 md:gap-4">
														<div class="flex-none md:w-[12rem]">
															{#if transfer.isLpExchange}
																<span
																	class="px-2 py-1 text-xs font-medium
                                                            {transfer.lpExchangeType === 'add'
																		? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
																		: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'} rounded-full"
																>
																	{transfer.lpExchangeType === 'add'
																		? 'Add Liquidity'
																		: 'Remove Liquidity'}
																</span>
															{/if}
														</div>
														<div class="flex-none">
															<div
																class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
															>
																{transfer.lpExchangeType === 'add'
																	? 'Tokens Provided'
																	: 'Tokens Received'}
															</div>
															<div class="flex flex-col gap-2">
																{#if transfer.exchangedTokens.tokenA}
																	<div class="flex items-center gap-2">
																		<div
																			class="w-7 h-7 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full"
																		>
																			<i
																				class="fas fa-coins text-gray-600 dark:text-gray-400 text-xs"
																			></i>
																		</div>
																		<div>
																			<span
																				class="text-sm font-medium text-gray-700 dark:text-gray-200"
																			>
																				{transfer.exchangedTokens.tokenA.amount}
																				{transfer.exchangedTokens.tokenA.symbol}
																			</span>
																			<div class="text-xs text-gray-500 dark:text-gray-400">
																				Token ID: {transfer.exchangedTokens.tokenA.id}
																			</div>
																		</div>
																	</div>
																{/if}
																{#if transfer.exchangedTokens.tokenB}
																	<div class="flex items-center gap-2">
																		<div
																			class="w-7 h-7 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full"
																		>
																			<i
																				class="fas fa-coins text-gray-600 dark:text-gray-400 text-xs"
																			></i>
																		</div>
																		<div>
																			<span
																				class="text-sm font-medium text-gray-700 dark:text-gray-200"
																			>
																				{transfer.exchangedTokens.tokenB.amount}
																				{transfer.exchangedTokens.tokenB.symbol}
																			</span>
																			<div class="text-xs text-gray-500 dark:text-gray-400">
																				Token ID: {transfer.exchangedTokens.tokenB.id}
																			</div>
																		</div>
																	</div>
																{/if}
															</div>
														</div>

														<div class="flex items-center mt-2 md:mt-0">
															<div class="flex-1 h-0.5 bg-gray-200 dark:bg-gray-600"></div>
															<div class="text-gray-500 dark:text-gray-400 px-2">
																<i
																	class="fas fa-{transfer.lpExchangeType === 'add'
																		? 'arrow-right'
																		: 'arrow-left'}"
																></i>
															</div>
															<div class="flex-1 h-0.5 bg-gray-200 dark:bg-gray-600"></div>
														</div>

														<div class="flex-none">
															<div
																class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
															>
																{transfer.lpExchangeType === 'add'
																	? 'LP Tokens Received'
																	: 'LP Tokens Provided'}
															</div>
															<div class="flex items-center gap-2">
																<div
																	class="w-7 h-7 flex items-center justify-center bg-purple-100 dark:bg-purple-900 rounded-full"
																>
																	<i
																		class="fas fa-chart-pie text-purple-600 dark:text-purple-400 text-xs"
																	></i>
																</div>
																<div>
																	<span
																		class="text-sm font-medium text-gray-700 dark:text-gray-200"
																	>
																		{transfer.amount}
																		{token.symbol}
																	</span>
																</div>
															</div>
														</div>
													</div>

													<div class="items-center mt-4 justify-center hidden">
														{#if isLPToken(token)}
															{@const poolUrl = getPoolUrl()}
															{#if poolUrl}
																<a
																	href={poolUrl}
																	target="_blank"
																	rel="noopener noreferrer"
																	class="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1"
																>
																	<i class="fas fa-external-link-alt"></i>
																	View Pool Details
																</a>
															{/if}
														{/if}
													</div>
												{/if}

												<!-- Note Section -->
												{#if transfer.note}
													<div
														class={transfer.isLpExchange &&
														transfer.exchangedTokens &&
														showLPExchangeDetails
															? 'mt-3'
															: ''}
													>
														<div class="md:pl-[12.5rem] overflow-auto">
															<div class="text-gray-500 dark:text-gray-400 font-medium text-xs">
																Tx Note
															</div>
															{#if transfer.isLpExchange && transfer.exchangedTokens}
																<!-- For LP tokens, show truncated text with expand option -->
																<div class="text-gray-600 dark:text-gray-300 text-sm">
																	{#if expandedRows.has(transfer.transactionid + '-note')}
																		<!-- Show full note when expanded -->
																		<div class="whitespace-pre-wrap break-words break-all">
																			{transfer.note}
																		</div>
																		<button
																			class="text-blue-500 hover:text-blue-600 text-xs mt-1 inline-flex items-center gap-1"
																			on:click={() =>
																				expandedRows.delete(transfer.transactionid + '-note') &&
																				(expandedRows = expandedRows)}
																		>
																			Show less <i class="fas fa-chevron-up"></i>
																		</button>
																	{:else}
																		<!-- Show truncated text when collapsed -->
																		<div class="break-words break-all">
																			{transfer.note.length > 100
																				? transfer.note.substring(0, 100)
																				: transfer.note}
																			{#if transfer.note.length > 100}
																				<span class="text-gray-400 dark:text-gray-500">...</span>
																			{/if}
																		</div>
																		{#if transfer.note.length > 100}
																			<button
																				class="text-blue-500 hover:text-blue-600 text-xs mt-1 inline-flex items-center gap-1"
																				on:click={() =>
																					expandedRows.add(transfer.transactionid + '-note') &&
																					(expandedRows = expandedRows)}
																			>
																				Show more <i class="fas fa-chevron-down"></i>
																			</button>
																		{/if}
																	{/if}
																</div>
															{:else}
																<!-- For non-LP tokens, show full note as before -->
																<div
																	class="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap break-words break-all"
																>
																	{transfer.note}
																</div>
															{/if}
														</div>
													</div>
												{/if}
											</div>

											<!-- View link consistently positioned at top-right -->
											<div class="flex-none ml-4">
												<a
													href={`https://block.voi.network/explorer/transaction/${transfer.type === 'inner-payment' ? transfer.parentTxId : transfer.transactionid}`}
													class="text-blue-500 hover:text-blue-600 transition-colors text-xs inline-flex items-center gap-1"
													target="_blank"
													rel="noopener noreferrer"
												>
													View <i class="fas fa-magnifying-glass"></i>
												</a>
											</div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
				{#if isLoading}
					<div class="flex justify-center items-center py-4">
						<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
					</div>
				{/if}
			</div>
		</div>
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
