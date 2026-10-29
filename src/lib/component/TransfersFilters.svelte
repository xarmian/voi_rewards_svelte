<script lang="ts">
	import type { FungibleTokenType, LPToken } from '$lib/types/assets';
	import { isLPToken } from '$lib/tokens/lpStats';

	let {
		token,
		fromAddress = $bindable(),
		toAddress = $bindable(),
		note = $bindable(),
		showMobileFilters = $bindable(),
		showFeeTransactions = $bindable(),
		showLPExchangeDetails = $bindable()
	}: {
		token: FungibleTokenType | LPToken;
		fromAddress: string;
		toAddress: string;
		note: string;
		showMobileFilters: boolean;
		showFeeTransactions: boolean;
		showLPExchangeDetails: boolean;
	} = $props();
</script>

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
			<label for="note" class="text-sm font-medium text-gray-700 dark:text-gray-300">Note</label>
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
					class="text-sm font-medium text-gray-700 dark:text-gray-300">Show Fee Transactions</label
				>
				<div class="flex items-center">
					<button
						class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-full text-left flex justify-between items-center {showFeeTransactions
							? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
							: 'bg-gray-50 dark:bg-gray-700/50'}"
						onclick={() => (showFeeTransactions = !showFeeTransactions)}
					>
						<span class="text-sm text-gray-700 dark:text-gray-300"
							>{showFeeTransactions ? 'Showing' : 'Hidden'}</span
						>
						<i
							class="fas fa-toggle-{showFeeTransactions ? 'on text-blue-500' : 'off text-gray-400'}"
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
						onclick={() => (showLPExchangeDetails = !showLPExchangeDetails)}
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
			onclick={() => (showMobileFilters = !showMobileFilters)}
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
					<i class="fas fa-note-sticky absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
				</div>
				{#if token.type === 'native'}
					<button
						class="w-full px-4 py-2 text-left text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md flex justify-between items-center {showFeeTransactions
							? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
							: 'bg-gray-50 dark:bg-gray-700/50'}"
						onclick={() => (showFeeTransactions = !showFeeTransactions)}
					>
						<span class="text-gray-700 dark:text-gray-300">Show Fee Transactions</span>
						<i
							class="fas fa-toggle-{showFeeTransactions ? 'on text-blue-500' : 'off text-gray-400'}"
						></i>
					</button>
				{:else if isLPToken(token)}
					<button
						class="w-full px-4 py-2 text-left text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md flex justify-between items-center {showLPExchangeDetails
							? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
							: 'bg-gray-50 dark:bg-gray-700/50'}"
						onclick={() => (showLPExchangeDetails = !showLPExchangeDetails)}
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
