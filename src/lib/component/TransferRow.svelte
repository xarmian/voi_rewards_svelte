<script lang="ts">
	import type { FungibleTokenType, LPToken } from '$lib/types/assets';
	import { isLPToken } from '$lib/tokens/lpStats';
	import type { Transfer } from '$lib/services/tokenTransfers';
	import { formatAddress } from '$lib/utils';

	let {
		token,
		transfer,
		walletId,
		showLPExchangeDetails,
		expandedRows,
		toggleRow,
		runningBalance,
		change,
		getPoolUrl,
		formatTimestamp
	}: {
		token: FungibleTokenType | LPToken;
		transfer: Transfer;
		walletId: string;
		showLPExchangeDetails: boolean;
		expandedRows: Set<string>;
		toggleRow: (transactionId: string) => void;
		runningBalance: string;
		change: string;
		getPoolUrl: () => string | undefined;
		formatTimestamp: (timestamp: number) => string;
	} = $props();
</script>

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
					<div class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
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
								{transfer.lpExchangeType === 'add' ? 'Add Liquidity' : 'Remove Liquidity'}
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
							{change}
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
						Balance: {runningBalance}
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
				<div class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
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
						{change}
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
					Balance: {runningBalance}
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
										{transfer.lpExchangeType === 'add' ? 'Add Liquidity' : 'Remove Liquidity'}
									</span>
								{/if}
							</div>
							<div class="flex-none">
								<div class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
									{transfer.lpExchangeType === 'add' ? 'Tokens Provided' : 'Tokens Received'}
								</div>
								<div class="flex flex-col gap-2">
									{#if transfer.exchangedTokens.tokenA}
										<div class="flex items-center gap-2">
											<div
												class="w-7 h-7 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full"
											>
												<i class="fas fa-coins text-gray-600 dark:text-gray-400 text-xs"></i>
											</div>
											<div>
												<span class="text-sm font-medium text-gray-700 dark:text-gray-200">
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
												<i class="fas fa-coins text-gray-600 dark:text-gray-400 text-xs"></i>
											</div>
											<div>
												<span class="text-sm font-medium text-gray-700 dark:text-gray-200">
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
								<div class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
									{transfer.lpExchangeType === 'add' ? 'LP Tokens Received' : 'LP Tokens Provided'}
								</div>
								<div class="flex items-center gap-2">
									<div
										class="w-7 h-7 flex items-center justify-center bg-purple-100 dark:bg-purple-900 rounded-full"
									>
										<i class="fas fa-chart-pie text-purple-600 dark:text-purple-400 text-xs"></i>
									</div>
									<div>
										<span class="text-sm font-medium text-gray-700 dark:text-gray-200">
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
							class={transfer.isLpExchange && transfer.exchangedTokens && showLPExchangeDetails
								? 'mt-3'
								: ''}
						>
							<div class="md:pl-[12.5rem] overflow-auto">
								<div class="text-gray-500 dark:text-gray-400 font-medium text-xs">Tx Note</div>
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
												onclick={() => toggleRow(transfer.transactionid + '-note')}
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
													onclick={() => toggleRow(transfer.transactionid + '-note')}
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
