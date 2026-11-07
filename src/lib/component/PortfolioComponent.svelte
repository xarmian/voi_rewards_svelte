<script lang="ts">
	/* eslint-disable @typescript-eslint/no-unused-vars -- Retain the frozen legacy controller declarations while migrating its presentation. */
	import { canSignFor } from '$lib/chain/signerGate';
	import { calculateEpochRewards, REWARDS_ADDRESSES } from '$lib/rewards/calculateEpochRewards';
	import { loadAccountDetails, totalRewardsMicroVoi } from '$lib/portfolio/accountDetails';
	import type { Part, AccountSnapshot, RewardsTransaction } from '$lib/portfolio/accountDetails';
	import WalletHoldings from '$lib/ds/WalletHoldings/WalletHoldings.svelte';
	import {
		createHoldingsTokenLoader,
		loadWalletNfts,
		enrichWalletNfts,
		type HoldingsSplit
	} from '$lib/wallet/holdings';
	import type { NFTToken } from '$lib/types/assets';
	import FungibleToken from './FungibleToken.svelte';
	import ClaimableTokenCard from './ClaimableTokenCard.svelte';
	import type { FungibleTokenType, ASAToken, LPToken, TokenApproval } from '$lib/types/assets';
	import { algodClient, algodIndexer } from '$lib/utils/algod';
	import { getEnvoiNames } from '$lib/utils/envoi';
	import { dataTable } from '../../stores/dataTable';
	import { getTokensByEpoch, decodeGlobalState } from '$lib/utils';
	import { getSupplyInfo, getConsensusInfo, requireAccountInfo } from '$lib/stores/accounts';
	import { config } from '$lib/config';
	import { voiPrice, fetchVoiPrice } from '$lib/stores/price';
	import CopyComponent from '$lib/component/ui/CopyComponent.svelte';
	import { selectedWallet, signTransactions, captureSigner } from '$lib/chain/wallet.svelte';
	import type { TransactionSigner } from '$lib/chain/wallet.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { fade } from 'svelte/transition';
	import ConsensusDetails from './ConsensusDetails.svelte';
	import StakingComponent from './ui/StakingComponent.svelte';

	import { arc200TransferFrom } from '$lib/utils/arc200';
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
		nftState = nfts ? 'stale' : 'loading';
		try {
			const owned = await loadWalletNfts(address, force);
			if (address !== walletAddress || generation !== nftGeneration) return;
			nfts = owned;
			nftState = 'ready';
			nftMetadataLoading = true;
			const enriched = await enrichWalletNfts(owned);
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
	let createdAtPart: Part<number> | { status: 'loading' } = { status: 'loading' };
	let rewardsPart: Part<RewardsTransaction[]> | { status: 'loading' } = { status: 'loading' };
	let epochPart: { status: 'loading' } | { status: 'loaded' } | { status: 'unavailable' } = {
		status: 'loading'
	};
	$: accountBalance = accountPart.status === 'loaded' ? accountPart.value.balance : 0;
	let loadGeneration = 0;
	let accountCreationDate: string | null = null;
	let accountCreationDateDays: number | null = null;
	let totalRewards: number = 0;
	let envoiName: string | null = null;
	let envoiAvatar: string | undefined = undefined;
	let epochData: any[] = [];
	let currentEpochRewards: number = 0;
	let rewardsHistory: any[] = [];
	let asaDetails: any[] = [];
	let canSignTransactions = false;
	let totalValue: number = 0;
	let totalUsdValue = 0;
	// TASK-108: the totals are 0 until the first recomputeTotals and partial until the first token list lands,
	// and a token list fetched before the price landed has no VOI-derived USD until its re-fetch settles; all of
	// that is loading, not $0 or unavailable. A failed re-fetch leaves those values unavailable.
	let totalsReady = false;
	$: totalsIncomplete = accountPart.status === 'unavailable';
	let tokensPrice = 0;
	$: usdPending =
		!$voiPrice.error &&
		($voiPrice.price <= 0 || (isLoadingTokens && fungibleTokens.length > 0 && tokensPrice <= 0));
	$: totalsPending =
		accountPart.status === 'loading' ||
		!totalsReady ||
		(isLoadingTokens && fungibleTokens.length === 0);

	let asaTokens: ASAToken[] = [];

	// Placeholder data for fungible tokens
	let fungibleTokens: FungibleTokenType[] = [];

	let showZeroBalances = false;

	// Add these to your existing type definitions and variables
	type TokenSortOption = {
		id: 'name' | 'type' | 'balance' | 'value';
		label: string;
	};

	const tokenSortOptions: TokenSortOption[] = [
		{ id: 'value', label: 'Value' },
		{ id: 'name', label: 'Name' },
		{ id: 'type', label: 'Type' },
		{ id: 'balance', label: 'Balance' }
	];

	let selectedTokenSort: TokenSortOption['id'] = 'value';
	let tokenSortDirection: 'asc' | 'desc' = 'desc';
	let tokenSearchQuery = '';
	let selectedTokenType: 'all' | 'vsa' | 'arc200' = 'all';
	let showSendVoiModal = false;
	let sendVoiBalance = 0;
	let lastInitializedWallet: string | undefined;
	let isLoadingPortfolio = false;
	let isLoadingLPTokens = false;
	let isLoadingTokens = false;
	let tokensError: string | null = null;
	let tokensPartial = false;
	let lastTokenPrice = 0;
	let isLoadingNFTs = false;
	let voteKeyExpiry: number | undefined;
	let voteKeyExpiryDate: Date | undefined;
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

	const LoadingOverlay = ({ height = 'h-full' }: { height?: string }) => `
        <div class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-[1px] z-10 flex items-center justify-center ${height}">
            <div class="flex flex-col items-center gap-3">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 dark:border-blue-400"></div>
                <span class="text-sm text-gray-600 dark:text-gray-300">Refreshing...</span>
            </div>
        </div>
    `;

	async function handleEpochsClick(event: MouseEvent) {
		event.preventDefault();
		const targetPath = `/wallet/${walletAddress}`;

		// If we're already on the wallet page, just update the hash
		if ($page.url.pathname === targetPath) {
			window.location.hash = 'epochs';
			// Ensure the epochs section is scrolled into view
			document.getElementById('epochs')?.scrollIntoView({ behavior: 'smooth' });
		} else {
			// Navigate to the wallet page with the epochs hash
			await goto(`${targetPath}#epochs`);
		}
	}

	function handleTokenSent() {
		refreshPortfolio();
		refreshTokens();
	}

	async function openSendVoiModal() {
		if (accountPart.status !== 'loaded') return;
		sendVoiBalance = accountPart.value.balance;
		try {
			SendTokenModal ??= (await import('./SendTokenModal.svelte')).default;
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
		try {
			BridgeModal ??= (await import('./BridgeModal.svelte')).default;
			showBridgeModal = true;
		} catch (error) {
			console.error('Failed to load BridgeModal:', error);
		}
	}

	$: canSignTransactions = canSignFor($selectedWallet, walletAddress);

	$: {
		// TASK-108: browser only. On the server the relative /api/voi-price fetch fails and its error stays in the
		// module-level store for every later render.
		if (browser && walletAddress && walletAddress !== lastInitializedWallet) {
			lastInitializedWallet = walletAddress;
			showSendVoiModal = false;
			fungibleTokens = [];
			lastTokenPrice = 0;
			tokensPrice = 0;
			totalsReady = false;
			tokensError = null;
			tokensPartial = false;
			totalValue = 0;
			totalUsdValue = 0;
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

	function recomputeTotals() {
		const voiBalance = accountPart.status === 'loaded' ? accountPart.value.balance / 1e6 : 0;
		// Recalculate total value
		totalValue =
			fungibleTokens.reduce((acc, token) => acc + token.value, 0) +
			asaDetails.reduce((acc, asa) => acc + (asa.value || 0), 0) +
			voiBalance;

		// Calculate total USD value separately
		totalUsdValue =
			fungibleTokens.reduce((acc, token) => acc + (token.usdValue || 0), 0) +
			asaDetails.reduce((acc, asa) => {
				// For ASA tokens, calculate USD value if it's aUSDC
				if (asa.id === 302190) {
					return acc + asa.amount / Math.pow(10, asa.decimals || 6);
				}
				return acc;
			}, 0) +
			// Add VOI balance USD value if VOI price is available
			($voiPrice.price > 0 ? voiBalance * $voiPrice.price : 0);
		totalsReady = true;
	}

	async function refreshPortfolio() {
		isLoadingPortfolio = true;
		try {
			await Promise.all([fetchAccountDetails(), fetchVoiPrice()]);
			recomputeTotals();
		} catch (error) {
			console.error('Error refreshing portfolio:', error);
		} finally {
			isLoadingPortfolio = false;
		}
	}

	async function refreshTokens() {
		const requestedWallet = walletAddress;
		const tokenGeneration = ++tokenLoadGeneration;
		isLoadingTokens = true;
		isLoadingLPTokens = true;
		lastTokenPrice = $voiPrice.price;
		try {
			const { tokens, partial } = await holdingsTokenLoader(requestedWallet, lastTokenPrice);
			if (walletAddress !== requestedWallet || tokenGeneration !== tokenLoadGeneration) return;
			fungibleTokens = tokens;
			tokensAsOf = new Date().toISOString();
			tokensPrice = lastTokenPrice;
			tokensError = null;
			tokensPartial = partial;
			recomputeTotals();
		} catch (error) {
			if (walletAddress !== requestedWallet || tokenGeneration !== tokenLoadGeneration) return;
			tokensError = error instanceof Error ? error.message : String(error);
			console.error('Error refreshing tokens:', error);
		} finally {
			if (walletAddress === requestedWallet && tokenGeneration === tokenLoadGeneration) {
				isLoadingTokens = false;
				isLoadingLPTokens = false;
			}
		}
	}

	async function initializePortfolio() {
		const requestedWallet = walletAddress;
		try {
			// First load essential account info
			isLoadingPortfolio = true;
			await Promise.all([fetchAccountDetails(), fetchVoiPrice()]);
			if (walletAddress !== requestedWallet) return;
			isLoadingPortfolio = false;

			// Then load tokens in parallel
			const tokenGeneration = ++tokenLoadGeneration;
			isLoadingTokens = true;
			isLoadingLPTokens = true;
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
					isLoadingLPTokens = false;
				}
			}

			// Calculate total value after all data is loaded
			recomputeTotals();
		} catch (error) {
			if (walletAddress !== requestedWallet) return;
			console.error('Error initializing portfolio:', error);
		} finally {
			if (walletAddress === requestedWallet) isLoadingPortfolio = false;
		}
	}

	function handleIconError(event: Event) {
		const img = event.target as HTMLImageElement;
		if (img) {
			img.style.display = 'none';
		}
	}

	async function fetchRewardsHistory(address: string): Promise<RewardsTransaction[]> {
		// Fetch all rewards transactions
		const rewardsPromises = REWARDS_ADDRESSES.map((sender) =>
			algodIndexer
				.searchForTransactions()
				.address(address)
				.addressRole('receiver')
				.beforeTime(new Date().toISOString())
				.do()
				.then((response) => response.transactions.filter((tx) => tx.sender === sender))
		);

		const allTransactions = await Promise.all(rewardsPromises);
		return allTransactions.flat();
	}

	async function fetchAccountDetails(force = false) {
		const generation = ++loadGeneration;
		if (!walletAddress) return;
		const requestedWallet = walletAddress;
		accountPart = { status: 'loading' };
		createdAtPart = { status: 'loading' };
		rewardsPart = { status: 'loading' };
		epochPart = { status: 'loading' };
		currentEpochRewards = 0;
		voteKeyExpiry = undefined;
		voteKeyExpiryDate = undefined;
		if (totalsReady) recomputeTotals();

		const epochLoading = (async () => {
			// Fetch Envoi name
			try {
				const envoiResults = await getEnvoiNames([requestedWallet]);
				if (generation !== loadGeneration || walletAddress !== requestedWallet) return;
				envoiName = envoiResults.length > 0 ? envoiResults[0].name : null;
				envoiAvatar = envoiResults.length > 0 ? envoiResults[0].metadata.avatar : undefined;
			} catch (err) {
				console.error('Error fetching Envoi name:', err);
			}

			// Calculate rewards using epoch data
			try {
				const dates = await dataTable.fetchDateRanges();
				const epochSummary = await fetch(
					`${config.proposalApiBaseUrl}?action=epoch-summary&wallet=${requestedWallet}`
				).then((r) => r.json());
				const [supplyData] = await Promise.all([getSupplyInfo()]);

				if (!supplyData) {
					throw new Error('Failed to fetch supply data');
				}

				const epochPromises = dates.map(async (date: any) => {
					const [startStr] = date.id.split('-');
					const formattedDate = `${startStr.slice(0, 4)}-${startStr.slice(4, 6)}-${startStr.slice(6, 8)}T00:00:00Z`;
					const snapshots = epochSummary.snapshots ? epochSummary.snapshots : epochSummary;

					const epochData = snapshots.find((e: any) => e.start_date === formattedDate);
					if (!epochData) return null;

					const tokens = await getTokensByEpoch(date.epoch);
					const { totalBlocksProduced, userBlocksProduced, expectedReward } = calculateEpochRewards(
						epochData,
						date.epoch,
						epochData.proposers[requestedWallet],
						tokens
					);

					return {
						epoch: date.epoch,
						startDate: new Date(epochData.start_date),
						endDate: new Date(epochData.end_date),
						expectedReward,
						totalBlocksProduced,
						userBlocksProduced
					};
				});

				const loadedEpochData = (await Promise.all(epochPromises)).filter(
					(data): data is NonNullable<typeof data> => data !== null
				);
				if (generation !== loadGeneration || walletAddress !== requestedWallet) return;
				epochData = loadedEpochData;

				// Calculate current epoch rewards
				const now = new Date();
				const currentEpoch = epochData.find(
					(epoch) => now >= epoch.startDate && now <= epoch.endDate
				);
				currentEpochRewards = currentEpoch?.expectedReward ?? 0;
				epochPart = { status: 'loaded' };
			} catch (err) {
				console.error('Error calculating rewards:', err);
				if (generation !== loadGeneration || walletAddress !== requestedWallet) return;
				epochPart = { status: 'unavailable' };
			}
		})();

		await loadAccountDetails(
			requestedWallet,
			{
				fetchAccount: (address) => requireAccountInfo(address, { force }),
				lookupCreatedAt: async (address) => {
					const info = await algodIndexer.lookupAccountByID(address).do();
					const createdAtRound = info.account.createdAtRound;
					if (createdAtRound === undefined) {
						throw new Error('The indexer did not report when this account was created');
					}
					const block = await algodIndexer.lookupBlock(createdAtRound).do();
					return Number(block.timestamp);
				},
				fetchRewardsTransactions: fetchRewardsHistory
			},
			{
				onPart: (part, result) => {
					if (generation !== loadGeneration || walletAddress !== requestedWallet) return;
					if (part === 'account') {
						accountPart = result;
						if (accountPart.status === 'loaded') {
							const account = accountPart.value;
							if (account.status === 'Online' && account.voteLastValid !== undefined) {
								voteKeyExpiry = (account.voteLastValid - account.round) * 3.3; // 3.3 seconds per block
								voteKeyExpiryDate = new Date(Date.now() + voteKeyExpiry * 1000);
							}
						}
						if (totalsReady) recomputeTotals();
					} else if (part === 'createdAt') {
						createdAtPart = result;
						if (createdAtPart.status === 'loaded') {
							accountCreationDate = new Date(createdAtPart.value * 1000).toLocaleDateString();
							accountCreationDateDays = Math.floor(
								(new Date().getTime() - new Date(accountCreationDate).getTime()) /
									(1000 * 60 * 60 * 24)
							);
						}
					} else {
						rewardsPart = result;
						if (rewardsPart.status === 'loaded') {
							rewardsHistory = rewardsPart.value;
							totalRewards = totalRewardsMicroVoi(rewardsHistory);
						}
					}
				}
			}
		);
		await epochLoading;
	}

	function retryAccountDetails() {
		return fetchAccountDetails(true);
	}

	function formatNumber(value: number | undefined, decimals: number = 6): string {
		if (value === undefined || !isFinite(value)) return '0';

		try {
			if (BigInt(value) >= BigInt(10_000_000_000_000_000_000_000_000_000_000)) {
				return 'Unlimited';
			}
		} catch (err) {
			// silent fail
		}

		return value.toLocaleString('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: decimals
		});
	}

	function getTokenType(token: any): 'vsa' | 'arc200' {
		return 'assetId' in token ? 'vsa' : 'arc200';
	}

	// The sort and filter state are parameters, not closure reads: a legacy-mode template
	// re-runs only on the variables its expression names (svelte >=5.34.4; TASK-38 trail).
	function sortTokens(
		tokens: any[],
		selectedTokenSort: string,
		tokenSortDirection: 'asc' | 'desc'
	): any[] {
		return [...tokens].sort((a, b) => {
			const aDetails = asaDetails.find((d) => d.id === a.assetId);
			const bDetails = asaDetails.find((d) => d.id === b.assetId);

			let comparison = 0;
			switch (selectedTokenSort) {
				case 'name':
					const aName = aDetails?.name || a.name || '';
					const bName = bDetails?.name || b.name || '';
					comparison = aName.localeCompare(bName);
					break;
				case 'type':
					comparison = getTokenType(a).localeCompare(getTokenType(b));
					break;
				case 'balance':
					const aBalance =
						(aDetails?.amount || a.balance || 0) /
						Math.pow(10, aDetails?.decimals || a.decimals || 0);
					const bBalance =
						(bDetails?.amount || b.balance || 0) /
						Math.pow(10, bDetails?.decimals || b.decimals || 0);
					comparison = aBalance - bBalance;
					break;
				case 'value':
					const aValue = aDetails?.value || a.value || 0;
					const bValue = bDetails?.value || b.value || 0;
					comparison = aValue - bValue;
					break;
			}
			return tokenSortDirection === 'asc' ? comparison : -comparison;
		});
	}

	function filterTokens(tokens: any[], selectedTokenType: string, tokenSearchQuery: string): any[] {
		return tokens.filter((token) => {
			const details = asaDetails.find((d) => d.id === token.assetId);
			const name = (details?.name || token.name || '').toLowerCase();
			const id = (details?.id || token.id || '').toString();
			const type = getTokenType(token);

			// Type filter
			if (selectedTokenType !== 'all' && type !== selectedTokenType) {
				return false;
			}

			// Search query filter
			if (tokenSearchQuery) {
				const query = tokenSearchQuery.toLowerCase();
				return name.includes(query) || id.includes(query);
			}

			return true;
		});
	}

	$: showZeroBalancesCondition = (token: any) => {
		if (showZeroBalances) return true;

		// For tokens with approvals (incoming or outgoing), always show them
		if (token.approvals?.length > 0 || token.outgoingApprovals?.length > 0) return true;

		// For tokens with value, check if value exceeds threshold
		const details = asaDetails.find((d) => d.id === token.assetId);
		return details
			? details?.value
				? details?.value > 0.1
				: details?.amount / Math.pow(10, details?.decimals || 0) > 0.01
			: token?.value
				? token?.value > 0.1
				: token?.balance / Math.pow(10, token?.decimals || 0) > 0.01;
	};

	function isLPToken(token: FungibleTokenType | LPToken) {
		return 'poolInfo' in token && token.poolInfo !== undefined;
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
		const selected = $selectedWallet;
		if (selected?.address !== walletAddress || !selected.app || selected.app === 'Watch') {
			bulkClaimError = `Select account ${walletAddress} in a signing wallet to continue.`;
			return;
		}

		// The account the user confirmed. Every batch signs as it, wherever the picker goes. The store
		// above can lag the rune store by a tick, so the capture can still refuse: show it.
		let signer: TransactionSigner;
		try {
			signer = captureSigner();
		} catch (captureError) {
			bulkClaimError = captureError instanceof Error ? captureError.message : String(captureError);
			return;
		}
		// The claims below are built for the account this page shows, from its approvals. If the rune
		// store moved while the readable one still showed it, the signer is another account: refuse,
		// since a transfer built from the signer's address would not be the claim the user confirmed.
		if (signer.address !== walletAddress) {
			bulkClaimError = `Select account ${walletAddress} in a signing wallet to continue.`;
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

	function handleClaimableTokenViewDetails(event: CustomEvent) {
		const { tokenId } = event.detail;

		// Find the token card and scroll to it
		const tokenCard = document.querySelector(`[data-token-id="${tokenId}"]`);
		if (tokenCard) {
			tokenCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
			// Add a highlight effect
			tokenCard.classList.add('ring-2', 'ring-yellow-400', 'ring-opacity-50');
			setTimeout(() => {
				tokenCard.classList.remove('ring-2', 'ring-yellow-400', 'ring-opacity-50');
			}, 3000);
		}
	}

	function handleTokenClaimed(event: CustomEvent) {
		const { tokenId, success, error } = event.detail;

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
	<button
		on:click={openSendVoiModal}
		class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 dark:disabled:hover:bg-blue-600"
		disabled={!canSignTransactions || accountPart.status !== 'loaded'}
		title={accountPart.status !== 'loaded'
			? 'Balance unavailable'
			: !canSignTransactions
				? 'Connect wallet to send tokens'
				: 'Send VOI'}
	>
		<i class="fas fa-paper-plane"></i>
		Send
	</button>
	<button
		on:click={openBridgeModal}
		class="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:ring-4 focus:ring-purple-300 dark:focus:ring-purple-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-600 dark:disabled:hover:bg-purple-600"
		title={!canSignTransactions ? 'Connect wallet to bridge tokens' : 'Bridge VOI'}
	>
		<i class="fas fa-bridge"></i>
		Bridge
	</button>
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
		{canSignTransactions}
		walletId={walletAddress}
		{fungibleTokens}
		priceLoading={usdPending}
	/>
{/snippet}

{#snippet claimAmount(amount: number, decimals: number)}
	{@const precision = Math.min(decimals, 6)}
	{#if amount > 0 && amount < 10 ** -precision}
		&lt;{(10 ** -precision).toFixed(precision)}
	{:else}
		{amount.toLocaleString('en-US', { maximumFractionDigits: precision })}
	{/if}
{/snippet}

{#snippet claims()}
	{#if bulkClaimError}<p role="alert" class="break-all text-danger">{bulkClaimError}</p>{/if}
	{#if claimableTokensSummary.length > 0}
		<div class="min-w-0 space-y-4 rounded-ds-sm border border-line bg-surface-2 p-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3 class="text-h2">Claimable tokens</h3>
				{#if canSignTransactions && claimableTokensSummary.length > 0}
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
			{#if showClaimableSection}
				<div class="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each claimableTokensSummary.slice(0, 6) as claimableItem (claimableItem.token.id)}
						<div class="min-w-0">
							<p class="mb-2 break-words text-sm">
								{@render claimAmount(claimableItem.totalAmount, claimableItem.token.decimals)}
								{claimableItem.token.symbol} · {claimableItem.totalValue > 0
									? formatNumber(claimableItem.totalValue, 2) + ' VOI equivalent'
									: 'Value unavailable'}
							</p>
							<div class="wallet-claim-legacy">
								<ClaimableTokenCard
									token={claimableItem.token}
									approvals={claimableItem.approvals}
									totalAmount={claimableItem.totalAmount}
									totalValue={claimableItem.totalValue}
									{canSignTransactions}
									walletId={walletAddress}
									on:viewDetails={handleClaimableTokenViewDetails}
									on:tokenClaimed={handleTokenClaimed}
								/>
							</div>
						</div>
					{/each}
				</div>
				{#if claimableTokensSummary.length > 6}
					<button
						on:click={() => (isExpandingClaimableSection = !isExpandingClaimableSection)}
						class="min-h-10 rounded-ds-sm border border-edge px-3 text-accent"
						>{isExpandingClaimableSection
							? 'Show Less'
							: `Show ${claimableTokensSummary.length - 6} More`}</button
					>
					{#if isExpandingClaimableSection}
						<div class="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
							{#each claimableTokensSummary.slice(6) as claimableItem (claimableItem.token.id)}
								<div class="min-w-0">
									<p class="mb-2 break-words text-sm">
										{@render claimAmount(claimableItem.totalAmount, claimableItem.token.decimals)}
										{claimableItem.token.symbol} · {claimableItem.totalValue > 0
											? formatNumber(claimableItem.totalValue, 2) + ' VOI equivalent'
											: 'Value unavailable'}
									</p>
									<div class="wallet-claim-legacy">
										<ClaimableTokenCard
											token={claimableItem.token}
											approvals={claimableItem.approvals}
											totalAmount={claimableItem.totalAmount}
											totalValue={claimableItem.totalValue}
											{canSignTransactions}
											walletId={walletAddress}
											on:viewDetails={handleClaimableTokenViewDetails}
											on:tokenClaimed={handleTokenClaimed}
										/>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{/if}
				{#if isBulkClaiming}<p role="status" class="text-sm">
						Bulk Claim Progress: {Math.round(bulkClaimProgress)}%. Processing {bulkClaimResults.length}
						of {claimableTokensSummary.reduce((sum, item) => sum + item.approvals.length, 0)} approvals...
					</p>{/if}
			{/if}
		</div>
	{/if}
{/snippet}

<WalletHoldings
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
		bind:show={showBridgeModal}
		tokenKey="VOI"
		{canSignTransactions}
	/>
{/if}
