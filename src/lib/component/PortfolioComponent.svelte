<script lang="ts">
	import {
		pageAccountState,
		signerMatchesAccount,
		wrongSignerMessage
	} from '$lib/chain/signerGate';
	import { loadAccountDetails } from '$lib/portfolio/accountDetails';
	import type { Part, AccountSnapshot } from '$lib/portfolio/accountDetails';
	import WalletHoldings from '$lib/ds/WalletHoldings/WalletHoldings.svelte';
	import {
		createHoldingsTokenLoader,
		holdingsClaimKey,
		decimalsKnown,
		holdingsAmount,
		loadWalletNfts,
		enrichWalletNfts,
		type HoldingsSplit
	} from '$lib/wallet/holdings';
	import type { NFTToken } from '$lib/types/assets';
	import FungibleToken from './FungibleToken.svelte';
	import ClaimableTokenCard from './ClaimableTokenCard.svelte';
	import type { FungibleTokenType, TokenApproval } from '$lib/types/assets';
	import { algodClient, algodIndexer } from '$lib/utils/algod';
	import { requireAccountInfo } from '$lib/stores/accounts';
	import { voiPrice, fetchVoiPrice } from '$lib/stores/price';
	import { connectedWallets, signTransactions, capturePageSigner } from '$lib/chain/wallet.svelte';
	import type { TransactionSigner } from '$lib/chain/wallet.svelte';
	import { browser } from '$app/environment';
	import algosdk from 'algosdk';
	export let parentWalletAddress: string | null = null;
	export let walletAddress: string | undefined = undefined;

	// Read-only Holdings sources; every money handler below retains its original inputs.
	export let holdingsSplit: HoldingsSplit | undefined = undefined;
	const holdingsTokenLoader = createHoldingsTokenLoader();
	let tokenLoadGeneration = 0;
	let tokensAsOf: string | undefined;
	let sourceAddress: string | undefined;
	let nfts: NFTToken[] | undefined;
	let nftState: 'idle' | 'loading' | 'ready' | 'stale' | 'error' = 'idle';
	let nftPartial = false;
	let nftMetadataLoading = false;
	let nftGeneration = 0;
	$: if (walletAddress !== sourceAddress) {
		sourceAddress = walletAddress;
		tokenLoadGeneration++;
		tokensAsOf = undefined;
		nftGeneration++;
		nfts = undefined;
		nftState = 'idle';
		nftPartial = false;
		nftMetadataLoading = false;
	}

	async function readWalletNfts(force = false) {
		const address = walletAddress;
		if (!address || (!force && (nfts !== undefined || nftState === 'loading'))) return;
		const generation = ++nftGeneration;
		nftState = nfts ? 'ready' : 'loading';
		try {
			const owned = await loadWalletNfts(address, force);
			if (address !== walletAddress || generation !== nftGeneration) return;
			nfts = owned;
			nftState = 'ready';
			nftMetadataLoading = true;
			const enriched = await enrichWalletNfts(owned).catch(() => ({
				tokens: owned,
				partial: true
			}));
			if (address !== walletAddress || generation !== nftGeneration) return;
			nfts = enriched.tokens;
			nftPartial = enriched.partial;
		} catch {
			if (address !== walletAddress || generation !== nftGeneration) return;
			nftState = nfts ? 'stale' : 'error';
		} finally {
			if (address === walletAddress && generation === nftGeneration) nftMetadataLoading = false;
		}
	}

	let accountPart: Part<AccountSnapshot> | { status: 'loading' } = { status: 'loading' };
	$: accountBalance = accountPart.status === 'loaded' ? accountPart.value.balance : 0;
	let loadGeneration = 0;
	let tokensPrice = 0;
	$: usdPending =
		!$voiPrice.error &&
		($voiPrice.price <= 0 || (isLoadingTokens && fungibleTokens.length > 0 && tokensPrice <= 0));

	// Placeholder data for fungible tokens
	let fungibleTokens: FungibleTokenType[] = [];

	let showSendVoiModal = false;
	let sendVoiBalance = 0;
	let lastInitializedWallet: string | undefined;
	let isLoadingTokens = false;
	let tokensError: string | null = null;
	let tokensPartial = false;
	let lastTokenPrice = 0;
	let showVoiTransfersModal = false;
	let showBridgeModal = false;
	let SendTokenModal: typeof import('./SendTokenModal.svelte').default | null = null;
	let TokenTransfersModal: typeof import('./TokenTransfersModal.svelte').default | null = null;
	let BridgeModal: typeof import('./BridgeModal.svelte').default | null = null;

	// Claimable tokens summary variables
	let claimableTokensSummary: Array<{
		token: FungibleTokenType;
		approvals: TokenApproval[];
		totalAmount: number;
		totalValue: number;
	}> = [];
	let isExpandingClaimableSection = false;
	let showClaimableSection = false;

	function handleTokenSent() {
		refreshPortfolio();
		refreshTokens();
	}

	async function openSendVoiModal() {
		const page = walletAddress;
		if (!(pageAccountState(walletAddress, $connectedWallets).state === 'yours')) return;
		if (accountPart.status !== 'loaded') return;
		sendVoiBalance = accountPart.value.balance;
		try {
			SendTokenModal ??= (await import('./SendTokenModal.svelte')).default;
			if (walletAddress !== page || pageAccountState(page, $connectedWallets).state !== 'yours')
				return;
			showSendVoiModal = true;
		} catch (error) {
			console.error('Failed to load SendTokenModal:', error);
		}
	}

	async function openVoiTransfersModal() {
		try {
			TokenTransfersModal ??= (await import('./TokenTransfersModal.svelte')).default;
			showVoiTransfersModal = true;
		} catch (error) {
			console.error('Failed to load TokenTransfersModal:', error);
		}
	}

	async function openBridgeModal() {
		const page = walletAddress;
		if (!(pageAccountState(walletAddress, $connectedWallets).state === 'yours')) return;
		try {
			BridgeModal ??= (await import('./BridgeModal.svelte')).default;
			if (walletAddress !== page || pageAccountState(page, $connectedWallets).state !== 'yours')
				return;
			showBridgeModal = true;
		} catch (error) {
			console.error('Failed to load BridgeModal:', error);
		}
	}

	$: {
		// TASK-108: browser only. On the server the relative /api/voi-price fetch fails and its error stays in the
		// module-level store for every later render.
		if (browser && walletAddress && walletAddress !== lastInitializedWallet) {
			lastInitializedWallet = walletAddress;
			showSendVoiModal = false;
			fungibleTokens = [];
			lastTokenPrice = 0;
			tokensPrice = 0;
			tokensError = null;
			tokensPartial = false;
			initializePortfolio();
		}
	}

	$: if (
		$voiPrice.price > 0 &&
		lastTokenPrice <= 0 &&
		fungibleTokens.length > 0 &&
		!isLoadingTokens
	) {
		refreshTokens();
	}

	async function refreshPortfolio() {
		try {
			await Promise.all([fetchAccountDetails(), fetchVoiPrice()]);
		} catch (error) {
			console.error('Error refreshing portfolio:', error);
		}
	}

	async function refreshTokens() {
		const requestedWallet = walletAddress;
		const tokenGeneration = ++tokenLoadGeneration;
		isLoadingTokens = true;
		lastTokenPrice = $voiPrice.price;
		try {
			const { tokens, partial } = await holdingsTokenLoader(requestedWallet, lastTokenPrice);
			if (walletAddress !== requestedWallet || tokenGeneration !== tokenLoadGeneration) return;
			fungibleTokens = tokens;
			tokensAsOf = new Date().toISOString();
			tokensPrice = lastTokenPrice;
			tokensError = null;
			tokensPartial = partial;
		} catch (error) {
			if (walletAddress !== requestedWallet || tokenGeneration !== tokenLoadGeneration) return;
			tokensError = error instanceof Error ? error.message : String(error);
			console.error('Error refreshing tokens:', error);
		} finally {
			if (walletAddress === requestedWallet && tokenGeneration === tokenLoadGeneration) {
				isLoadingTokens = false;
			}
		}
	}

	async function initializePortfolio() {
		const requestedWallet = walletAddress;
		try {
			// First load essential account info
			await Promise.all([fetchAccountDetails(), fetchVoiPrice()]);
			if (walletAddress !== requestedWallet) return;

			// Then load tokens in parallel
			const tokenGeneration = ++tokenLoadGeneration;
			isLoadingTokens = true;
			lastTokenPrice = $voiPrice.price;
			try {
				const { tokens, partial } = await holdingsTokenLoader(requestedWallet, lastTokenPrice);
				if (walletAddress !== requestedWallet || tokenGeneration !== tokenLoadGeneration) return;
				fungibleTokens = tokens;
				tokensAsOf = new Date().toISOString();
				tokensPrice = lastTokenPrice;
				tokensError = null;
				tokensPartial = partial;
			} catch (error) {
				if (walletAddress !== requestedWallet || tokenGeneration !== tokenLoadGeneration) return;
				tokensError = error instanceof Error ? error.message : String(error);
				console.error('Error loading tokens:', error);
			} finally {
				if (walletAddress === requestedWallet && tokenGeneration === tokenLoadGeneration) {
					isLoadingTokens = false;
				}
			}
		} catch (error) {
			if (walletAddress !== requestedWallet) return;
			console.error('Error initializing portfolio:', error);
		}
	}

	async function fetchAccountDetails(force = false) {
		const generation = ++loadGeneration;
		if (!walletAddress) return;
		const requestedWallet = walletAddress;
		accountPart = { status: 'loading' };

		await loadAccountDetails(
			requestedWallet,
			{ fetchAccount: (address) => requireAccountInfo(address, { force }) },
			{
				onAccount: (result) => {
					if (generation !== loadGeneration || walletAddress !== requestedWallet) return;
					accountPart = result;
				}
			}
		);
	}

	function retryAccountDetails() {
		return fetchAccountDetails(true);
	}

	// Calculate claimable tokens summary
	function calculateClaimableTokensSummary() {
		const claimableTokens: Array<{
			token: FungibleTokenType;
			approvals: TokenApproval[];
			totalAmount: number;
			totalValue: number;
		}> = [];

		// Process fungible tokens for claimable approvals
		fungibleTokens.forEach((token) => {
			if (token.approvals && token.approvals.length > 0) {
				const validApprovals = token.approvals.filter((approval) => approval.amount !== '0');
				if (validApprovals.length > 0) {
					const totalAmount = validApprovals.reduce(
						(sum, approval) => sum + Number(approval.amount) / Math.pow(10, token.decimals),
						0
					);
					const totalValue =
						totalAmount * (token.value / (token.balance / Math.pow(10, token.decimals) || 1));

					claimableTokens.push({
						token,
						approvals: validApprovals,
						totalAmount,
						totalValue
					});
				}
			}
		});
		// Sort by total value (highest first)
		claimableTokens.sort((a, b) => b.totalValue - a.totalValue);

		return claimableTokens;
	}

	// Reactive statement to update claimable tokens summary
	$: {
		if (fungibleTokens.length > 0) {
			claimableTokensSummary = calculateClaimableTokensSummary();
		} else {
			claimableTokensSummary = [];
		}
	}

	// Bulk claim functionality
	let isBulkClaiming = false;
	let bulkClaimProgress = 0;
	let bulkClaimError: string | null = null;
	let bulkClaimResults: Array<{
		success: boolean;
		tokenName: string;
		wallet: string;
		error?: string;
	}> = [];

	async function bulkClaimAllTokens() {
		if (isBulkClaiming || !walletAddress) return;
		if (!(pageAccountState(walletAddress, $connectedWallets).state === 'yours')) {
			bulkClaimError = wrongSignerMessage();
			return;
		}

		// The account the user confirmed. Every batch signs as it, wherever the picker goes. The store
		// above can lag the rune store by a tick, so the capture can still refuse: show it.
		const target = walletAddress;
		let signer: TransactionSigner;
		try {
			signer = capturePageSigner(target);
		} catch (captureError) {
			bulkClaimError = captureError instanceof Error ? captureError.message : String(captureError);
			return;
		}
		// The claims below are built for the account this page shows, from its approvals. If the rune
		// store moved while the readable one still showed it, the signer is another account: refuse,
		// since a transfer built from the signer's address would not be the claim the user confirmed.
		if (!signerMatchesAccount(signer, target)) {
			bulkClaimError = wrongSignerMessage();
			return;
		}
		const claimAccount = signer.address;
		isBulkClaiming = true;
		bulkClaimProgress = 0;
		bulkClaimError = null;
		bulkClaimResults = [];

		// Collect all ARC-200 approvals that can be claimed
		const arc200Approvals: Array<{
			token: FungibleTokenType;
			approval: TokenApproval;
		}> = [];

		claimableTokensSummary.forEach((claimableItem) => {
			if (claimableItem.token.type === 'arc200') {
				claimableItem.approvals.forEach((approval) => {
					arc200Approvals.push({
						token: claimableItem.token,
						approval
					});
				});
			}
		});

		const totalApprovals = arc200Approvals.length;
		let processedCount = 0;

		try {
			// Step 1: Generate all transaction groups first
			const transactionGroups: Array<{
				transactions: algosdk.Transaction[];
				tokens: Array<{ token: FungibleTokenType; approval: TokenApproval }>;
			}> = [];

			for (const { token, approval } of arc200Approvals) {
				try {
					const appId = Number(token.id);
					const from = approval.owner;
					const to = claimAccount;
					const amount = approval.amount;

					// Get the unsigned transactions from arc200TransferFrom without signing
					const ulujs = await import('ulujs');
					const Arc200Contract = ulujs.arc200;

					const contract = new Arc200Contract(appId, algodClient, algodIndexer, {
						acc: {
							addr: claimAccount,
							sk: new Uint8Array()
						}
					});

					const txn = await contract.arc200_transferFrom(from, to, BigInt(amount), true, false);

					if (txn.success) {
						// Decode the transactions
						const decodedTxns: algosdk.Transaction[] = txn.txns.map((txnData: string) =>
							algosdk.decodeUnsignedTransaction(Buffer.from(txnData, 'base64'))
						);

						transactionGroups.push({
							transactions: decodedTxns,
							tokens: [{ token, approval }]
						});
					}
				} catch (error) {
					console.error('Error creating transaction for', token.name, error);
				}
			}

			// Step 2: Create batches of up to 16 transactions while keeping transaction groups together
			const transactionBatches: Array<{
				transactions: algosdk.Transaction[];
				tokens: Array<{ token: FungibleTokenType; approval: TokenApproval }>;
			}> = [];

			let currentBatch = {
				transactions: [] as algosdk.Transaction[],
				tokens: [] as Array<{ token: FungibleTokenType; approval: TokenApproval }>
			};

			for (const group of transactionGroups) {
				// Check if adding this group would exceed 16 transactions
				if (currentBatch.transactions.length + group.transactions.length > 16) {
					// If current batch has transactions, finalize it
					if (currentBatch.transactions.length > 0) {
						transactionBatches.push(currentBatch);
						currentBatch = {
							transactions: [],
							tokens: []
						};
					}
				}

				// Add the group to current batch
				currentBatch.transactions.push(...group.transactions);
				currentBatch.tokens.push(...group.tokens);
			}

			// Add the last batch if it has transactions
			if (currentBatch.transactions.length > 0) {
				transactionBatches.push(currentBatch);
			}

			// Step 3: Process each batch
			for (const batch of transactionBatches) {
				try {
					// Remove group ID from all transactions
					batch.transactions.forEach((txn) => {
						delete txn.group;
					});

					// Assign a new group ID to all transactions in this batch
					const grouped = algosdk.assignGroupID(batch.transactions);

					// Sign all transactions at once, as the captured account
					const signedTxns = await signTransactions([grouped], signer);
					if (!signedTxns) {
						throw new Error('User rejected transaction signing');
					}

					// Submit the signed transactions
					const response = await algodClient.sendRawTransaction(signedTxns).do();

					// Wait for confirmation
					await algosdk.waitForConfirmation(algodClient, response.txid, 4);

					// Mark all in this batch as successful
					batch.tokens.forEach(({ token }) => {
						bulkClaimResults.push({
							success: true,
							tokenName: token.name,
							wallet: claimAccount
						});
					});

					processedCount += batch.tokens.length;
					bulkClaimProgress = (processedCount / totalApprovals) * 100;
				} catch (error) {
					// If user cancels or batch fails, mark all in batch as failed
					batch.tokens.forEach(({ token }) => {
						bulkClaimResults.push({
							success: false,
							tokenName: token.name,
							wallet: claimAccount,
							error: error instanceof Error ? error.message : 'Batch failed'
						});
					});

					// A signer error (disconnected wallet, watch-only account, sender mismatch, or a wallet
					// that returned the wrong signatures) will not clear on the next batch, and each retry
					// would prompt the user again: stop, and show the library's message.
					if (
						typeof error === 'object' &&
						error !== null &&
						'code' in error &&
						typeof error.code === 'string' &&
						error.code.startsWith('SIGNER_')
					) {
						bulkClaimError = error instanceof Error ? error.message : 'Batch failed';
						break;
					}

					// If user cancelled, stop the entire process
					if (error instanceof Error && error.message.includes('rejected')) {
						console.log('User cancelled bulk claim process');
						break;
					}

					processedCount += batch.tokens.length;
					bulkClaimProgress = (processedCount / totalApprovals) * 100;
				}
			}

			// Refresh portfolio after bulk claim
			await refreshPortfolio();
			await refreshTokens();
		} catch (error) {
			console.error('Bulk claim error:', error);
		} finally {
			isBulkClaiming = false;
		}
	}

	function handleTokenClaimed(event: CustomEvent) {
		const { success, error } = event.detail;

		if (success) {
			// Refresh the portfolio to update the claimable tokens list
			refreshPortfolio();
			refreshTokens();
		} else {
			console.error('Token claim failed:', error);
		}
	}
</script>

{#snippet nativeActions()}
	{#if pageAccountState(walletAddress, $connectedWallets).state === 'yours'}<button
			on:click={openSendVoiModal}
			class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 dark:disabled:hover:bg-blue-600"
			disabled={accountPart.status !== 'loaded'}
			title={accountPart.status !== 'loaded' ? 'Balance unavailable' : 'Send VOI'}
		>
			<i class="fas fa-paper-plane"></i>
			Send
		</button>{/if}
	{#if pageAccountState(walletAddress, $connectedWallets).state === 'yours'}<button
			on:click={openBridgeModal}
			class="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:ring-4 focus:ring-purple-300 dark:focus:ring-purple-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-600 dark:disabled:hover:bg-purple-600"
			title="Bridge VOI"
		>
			<i class="fas fa-bridge"></i>
			Bridge
		</button>{/if}
	<button
		on:click={openVoiTransfersModal}
		class="px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-1"
		title="View VOI transaction history"
	>
		<i class="fas fa-clock-rotate-left"></i>
		History
	</button>
{/snippet}

{#snippet tokenActions(token: FungibleTokenType)}
	<FungibleToken
		{token}
		on:tokenOptedOut={initializePortfolio}
		on:tokenSent={initializePortfolio}
		walletId={walletAddress}
		{fungibleTokens}
		priceLoading={usdPending}
	/>
{/snippet}

{#snippet claimAmount(amount: number, decimals: number)}
	{#if !decimalsKnown(decimals)}
		Unavailable
	{:else}
		{@const precision = Math.min(decimals, 6)}
		{#if amount > 0 && amount < 10 ** -precision}
			&lt;{(10 ** -precision).toFixed(precision)}
		{:else}
			{amount.toLocaleString('en-US', { maximumFractionDigits: precision })}
		{/if}
	{/if}
{/snippet}

{#snippet claims()}
	{#if bulkClaimError}<p role="alert" class="break-all text-danger">{bulkClaimError}</p>{/if}
	{#if claimableTokensSummary.length > 0}
		<div class="min-w-0 space-y-4 rounded-ds-sm border border-line bg-surface-2 p-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3 class="text-h2">Claimable tokens</h3>
				{#if pageAccountState(walletAddress, $connectedWallets).state === 'yours' && claimableTokensSummary.length > 0}
					<button
						on:click={bulkClaimAllTokens}
						disabled={isBulkClaiming}
						class="px-4 py-2 text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 rounded-lg transition-colors flex items-center gap-2 disabled:cursor-not-allowed"
						title="Claim all available tokens at once"
					>
						{#if isBulkClaiming}
							<div
								class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
							></div>
							Claiming...
						{:else}
							<i class="fas fa-hand-holding-dollar"></i>
							Claim All
						{/if}
					</button>
				{/if}
				<button
					on:click={() => (showClaimableSection = !showClaimableSection)}
					class="min-h-10 rounded-ds-sm border border-edge px-3 text-accent"
					title={showClaimableSection ? 'Hide claimable tokens' : 'Show claimable tokens'}
					>{showClaimableSection ? 'Hide claimable tokens' : 'Show claimable tokens'}</button
				>
			</div>
			<div hidden={!showClaimableSection}>
				<div class="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each claimableTokensSummary as claimableItem, index (holdingsClaimKey(claimableTokensSummary, index, walletAddress))}
						<div class="min-w-0" hidden={index >= 6 && !isExpandingClaimableSection}>
							<p class="mb-2 break-words text-sm">
								{@render claimAmount(claimableItem.totalAmount, claimableItem.token.decimals)}
								{claimableItem.token.symbol} · {claimableItem.totalValue > 0
									? holdingsAmount(claimableItem.totalValue) + ' VOI equivalent'
									: 'Value unavailable'}
							</p>
							<div class="wallet-claim-legacy">
								<ClaimableTokenCard
									token={claimableItem.token}
									approvals={claimableItem.approvals}
									totalAmount={claimableItem.totalAmount}
									totalValue={claimableItem.totalValue}
									walletId={walletAddress}
									on:viewDetails={(event) => {
										const { tokenId } = event.detail;
										const marker = [
											...document.querySelectorAll<HTMLElement>('[data-holdings-token-id]')
										].find(
											(element) =>
												element.dataset.holdingsTokenId === `${typeof tokenId}:${tokenId}`
										);
										const row = marker?.closest('tr');
										const disclosure =
											row?.querySelector<HTMLButtonElement>('button[aria-controls]');
										if (disclosure?.getAttribute('aria-expanded') === 'false') disclosure.click();
										const target =
											row ?? document.getElementById('ds-holdings-tokens')?.closest('section');
										if (target) {
											target.scrollIntoView({ behavior: 'smooth', block: 'center' });
											target.classList.add('ring-2', 'ring-yellow-400', 'ring-opacity-50');
											setTimeout(
												() =>
													target.classList.remove('ring-2', 'ring-yellow-400', 'ring-opacity-50'),
												3000
											);
										}
									}}
									on:tokenClaimed={handleTokenClaimed}
								/>
							</div>
						</div>
						{#if index === 5 && claimableTokensSummary.length > 6}
							<div class="col-span-full">
								<button
									on:click={() => (isExpandingClaimableSection = !isExpandingClaimableSection)}
									class="min-h-10 rounded-ds-sm border border-edge px-3 text-accent"
									>{isExpandingClaimableSection
										? 'Show Less'
										: `Show ${claimableTokensSummary.length - 6} More`}</button
								>
							</div>
						{/if}
					{/each}
				</div>
				{#if isBulkClaiming}<p role="status" class="text-sm">
						Bulk Claim Progress: {Math.round(bulkClaimProgress)}%. Processing {bulkClaimResults.length}
						of {claimableTokensSummary.reduce((sum, item) => sum + item.approvals.length, 0)} approvals...
					</p>{/if}
			</div>
		</div>
	{/if}
{/snippet}

<WalletHoldings
	{parentWalletAddress}
	scopeLabel={parentWalletAddress ? 'Contract account only' : 'Account and listed contracts'}
	pageAddress={walletAddress ?? ''}
	account={accountPart}
	tokens={fungibleTokens}
	tokenState={tokensError ? (tokensAsOf ? 'stale' : 'error') : !tokensAsOf ? 'loading' : 'ready'}
	tokenError={tokensError}
	partial={tokensPartial}
	asOf={tokensAsOf}
	split={holdingsSplit}
	price={$voiPrice.error ? null : $voiPrice.price || null}
	onretryAccount={retryAccountDetails}
	onretryTokens={refreshTokens}
	{nativeActions}
	{tokenActions}
	{claims}
	{nfts}
	{nftState}
	{nftPartial}
	{nftMetadataLoading}
	onnfts={() => readWalletNfts()}
	onretryNfts={() => readWalletNfts(true)}
/>

<!-- Send VOI Modal -->
{#if typeof walletAddress === 'string' && showSendVoiModal}
	<svelte:component
		this={SendTokenModal}
		accountAddress={walletAddress}
		bind:open={showSendVoiModal}
		token={{
			type: 'native',
			symbol: 'VOI',
			decimals: 6,
			balance: sendVoiBalance,
			name: 'Voi'
		}}
		tokens={fungibleTokens}
		onTokenSent={handleTokenSent}
	/>
{/if}

<!-- VOI Transfers Modal -->
{#if typeof walletAddress === 'string' && showVoiTransfersModal}
	<svelte:component
		this={TokenTransfersModal}
		bind:open={showVoiTransfersModal}
		balanceUnavailable={accountPart.status !== 'loaded'}
		token={{
			id: '0',
			type: 'native',
			symbol: 'VOI',
			decimals: 6,
			balance: accountBalance,
			name: 'Voi',
			verified: true,
			imageUrl: '/icons/voi_icon.png',
			value: accountBalance / 1e6
		}}
		walletId={walletAddress}
	/>
{/if}

<!-- Bridge Modal -->
{#if typeof walletAddress === 'string' && showBridgeModal}
	<svelte:component
		this={BridgeModal}
		accountAddress={walletAddress}
		bind:show={showBridgeModal}
		tokenKey="VOI"
	/>
{/if}
