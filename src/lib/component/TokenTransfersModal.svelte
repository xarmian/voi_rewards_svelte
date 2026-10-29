<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { FungibleTokenType, LPToken } from '$lib/types/assets';
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
	import TransfersFilters from './TransfersFilters.svelte';
	import LpStatsPanel from './LpStatsPanel.svelte';
	import TransferRow from './TransferRow.svelte';

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
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retain the original modal state.
	let totalProfitLossA = 0; // Total profit/loss including removed tokens
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retain the original modal state.
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

			<TransfersFilters
				{token}
				bind:fromAddress
				bind:toAddress
				bind:note
				bind:showMobileFilters
				bind:showFeeTransactions
				bind:showLPExchangeDetails
			/>

			<!-- Main scrollable content area -->
			<div
				class="flex-1 overflow-auto p-4"
				on:scroll={handleScroll}
				style="max-height: calc(90vh - {isLPToken(token) ? '220px' : '180px'}); min-height: 250px;"
			>
				<LpStatsPanel
					{token}
					{transfers}
					{isLoading}
					{showLpStats}
					{currentPoolBalance}
					{formatNumber}
					{totalTokenAAdded}
					{totalTokenBAdded}
					{totalTokenARemoved}
					{totalTokenBRemoved}
					{profitLossA}
					{profitLossB}
					{profitLossPercentA}
					{profitLossPercentB}
					{totalProfitLossInA}
					{totalProfitLossInB}
					{totalProfitLossPercentInA}
					{totalProfitLossPercentInB}
				/>

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
							<TransferRow
								{token}
								{transfer}
								{walletId}
								{showLPExchangeDetails}
								{expandedRows}
								{toggleRow}
								runningBalance={calculateRunningBalance(index, token, filteredTransfers, walletId)}
								change={formatChange(transfer, token, walletId)}
								{getPoolUrl}
								{formatTimestamp}
							/>
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
