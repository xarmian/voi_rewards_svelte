import { requireAccountInfo } from '$lib/stores/accounts';
import type { PoolInfo } from '$lib/services/lp';
import { nomadexPools, type NomadexAssetType } from '$lib/services/nomadexPools';
import type { FungibleTokenType, TokenApproval, ARC200Token } from '$lib/types/assets';
import algosdk from 'algosdk';

// Type for the unified API response
interface UnifiedAssetBalance {
	name: string;
	symbol: string;
	balance: string;
	decimals: number;
	imageUrl: string;
	usdValue: string | null;
	verified: number;
	accountId: string;
	assetType: 'arc200' | 'asa';
	contractId: number;
}

interface UnifiedAssetsResponse {
	balances: UnifiedAssetBalance[];
	'next-token': string | null;
	'total-count': number;
	'current-round': number;
}

// An LP side's display info. The pool's own decimals win over the holder's balances,
// which only cover tokens the holder also holds (TASK-97).
function getTokenInfo(
	tokenId: string,
	tokenDetails: UnifiedAssetBalance | undefined,
	fallbackSymbol?: string,
	poolDecimals?: number
) {
	if (tokenId === '0') return { symbol: 'VOI', name: 'Voi', decimals: 6 };
	if (tokenId === '390001') return { symbol: 'wVOI', name: 'Wrapped Voi', decimals: 6 };
	const fallback = fallbackSymbol || 'Unknown';
	return {
		symbol: tokenDetails ? tokenDetails.symbol : fallback,
		name: tokenDetails ? tokenDetails.name : fallback,
		decimals: poolDecimals ?? tokenDetails?.decimals ?? 6
	};
}

async function fetchAllAssetBalances(walletAddress: string, fetchFn: typeof fetch): Promise<UnifiedAssetsResponse> {
	const baseUrl = `https://voi-mainnet-mimirapi.nftnavigator.xyz/account/assets`;
	const allBalances: UnifiedAssetBalance[] = [];
	let nextToken: string | null = null;
	let totalCount = 0;
	let currentRound = 0;

	do {
		const url = new URL(baseUrl);
		url.searchParams.set('accountId', walletAddress);
		url.searchParams.set('limit', '1000');
		if (nextToken) {
			url.searchParams.set('next-token', nextToken);
		}

		const response = await fetchFn(url.toString());
		if (!response.ok) throw new Error('Failed to fetch unified assets');

		const data: UnifiedAssetsResponse = await response.json();
		allBalances.push(...data.balances);
		nextToken = data['next-token'];
		totalCount = data['total-count'];
		currentRound = data['current-round'];
	} while (nextToken && allBalances.length < totalCount);

	return {
		balances: allBalances,
		'next-token': null,
		'total-count': totalCount,
		'current-round': currentRound
	};
}

export async function fetchFungibleTokens(
	walletAddress: string | undefined,
	voiPriceUSD: number = 0,
	deps: { getLiquidityPools: () => Promise<PoolInfo[]>; fetch?: typeof fetch }
): Promise<{ tokens: FungibleTokenType[]; partial: boolean }> {
	const fetchFn = deps.fetch ?? fetch;
	if (!walletAddress) return { tokens: [], partial: false };

	let partial = false;
	async function readEscrowArc200Balance(contractId: number, escrow: string): Promise<string> {
		const response = await fetchFn(
			`https://voi-mainnet-mimirapi.voirewards.com/arc200/balances?contractId=${contractId}&accountId=${escrow}`
		);
		if (!response.ok) throw new Error(`ARC200 balance HTTP ${response.status}`);
		const data: { balances?: { balance?: string }[] } = await response.json();
		const balance = data.balances?.[0]?.balance;
		if (typeof balance !== 'string' || !/^-?\d+$/.test(balance)) {
			throw new Error('Missing or invalid escrow ARC200 balance');
		}
		return balance;
	}

	async function enrichNomadexPool(pool: PoolInfo) {
		const escrow = algosdk.getApplicationAddress(Number(pool.poolId));
		if (!pool.supply) {
			try {
				// Nomadex records the circulating LP supply as a negative balance at its escrow.
				const supply = -BigInt(await readEscrowArc200Balance(Number(pool.poolId), escrow));
				if (supply < 0n) throw new Error('Invalid Nomadex circulating supply');
				pool.supply = supply.toString();
			} catch (error) {
				partial = true;
				console.warn('Failed to fetch Nomadex LP supply:', pool.poolId, error);
			}
		}

		if (!pool.poolBalA || !pool.poolBalB) {
			const metadata = nomadexPools.find((entry) => entry.id.toString() === pool.poolId);
			if (!metadata) {
				partial = true;
				return;
			}
			let escrowInfo: ReturnType<typeof requireAccountInfo> | undefined;
			const readReserve = async (tokenId: number, tokenType: NomadexAssetType): Promise<string> => {
				try {
					let balance: string;
					if (tokenType === 2) {
						balance = await readEscrowArc200Balance(tokenId, escrow);
					} else {
						// Share the account response between native VOI and ASA reserve reads.
						escrowInfo ??= requireAccountInfo(escrow);
						const account = await escrowInfo;
						if (tokenType === 0) {
							balance = account.amount.toString();
						} else {
							// algosdk 2.10 returns raw REST JSON (`asset-id`); v3 models use `assetId`.
							const assets = account.assets as unknown as
								| {
										'asset-id'?: number | bigint;
										assetId?: number | bigint;
										amount: number | bigint;
								  }[]
								| undefined;
							const holding = assets?.find(
								(asset) => Number(asset['asset-id'] ?? asset.assetId) === tokenId
							);
							balance = (holding?.amount ?? 0).toString();
						}
					}
					if (!/^\d+$/.test(balance)) throw new Error('Invalid Nomadex reserve');
					return balance;
				} catch (error) {
					partial = true;
					console.warn('Failed to fetch Nomadex reserve:', pool.poolId, tokenId, error);
					return '';
				}
			};
			[pool.poolBalA, pool.poolBalB] = await Promise.all([
				pool.poolBalA || readReserve(metadata.alphaId, metadata.alphaType),
				pool.poolBalB || readReserve(metadata.betaId, metadata.betaType)
			]);
		}
		pool.tvl =
			pool.tokAId === '0'
				? Number(pool.poolBalA) * 2
				: pool.tokBId === '0'
					? Number(pool.poolBalB) * 2
					: 0;
	}

	async function fetchApprovals(url: string) {
		try {
			const response = await fetchFn(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return await response.json();
		} catch (error) {
			partial = true;
			console.warn('Failed to fetch optional token approvals:', url, error);
			return { approvals: [] };
		}
	}

	try {
		// Balances are required; pool and approval details can degrade independently.
		const [liquidityPools, unifiedAssetsData, approvalsData, outgoingApprovalsData] =
			await Promise.all([
				deps.getLiquidityPools().catch((error) => {
					partial = true;
					console.warn('Failed to fetch optional liquidity pools:', error);
					return [];
				}),
				fetchAllAssetBalances(walletAddress, fetchFn),
				fetchApprovals(
					`https://voi-mainnet-mimirapi.voirewards.com/arc200/approvals?spender=${walletAddress}`
				),
				fetchApprovals(`https://voi-mainnet-mimirapi.voirewards.com/arc200/approvals?owner=${walletAddress}`)
			]);

		// Create maps for easy lookup
		const approvalsMap = new Map<string, TokenApproval[]>();
		if (approvalsData.approvals) {
			approvalsData.approvals
				.filter((approval: TokenApproval) => approval.amount !== '0')
				.forEach((approval: TokenApproval) => {
					const contractId = approval.contractId.toString();
					if (!approvalsMap.has(contractId)) {
						approvalsMap.set(contractId, []);
					}
					approvalsMap.get(contractId)!.push(approval);
				});
		}

		const outgoingApprovalsMap = new Map<string, TokenApproval[]>();
		if (outgoingApprovalsData.approvals) {
			outgoingApprovalsData.approvals
				.filter((approval: TokenApproval) => approval.amount !== '0')
				.forEach((approval: TokenApproval) => {
					const contractId = approval.contractId.toString();
					if (!outgoingApprovalsMap.has(contractId)) {
						outgoingApprovalsMap.set(contractId, []);
					}
					outgoingApprovalsMap.get(contractId)!.push({
						spender: approval.spender,
						amount: approval.amount,
						timestamp: approval.timestamp,
						contractId: approval.contractId,
						transactionId: approval.transactionId,
						owner: approval.owner,
						round: approval.round
					});
				});
		}

		// Create a map of pools for easy lookup
		const poolsMap = new Map<string, PoolInfo>();
		liquidityPools.forEach((pool) => {
			poolsMap.set(pool.poolId, pool);
		});

		// Process tokens from unified API
		const tokens: FungibleTokenType[] = [];

		for (const asset of unifiedAssetsData.balances) {
			const tokenId = asset.contractId.toString();
			const pool = poolsMap.get(tokenId);
			if (
				pool?.provider === 'nomadex' &&
				asset.assetType === 'arc200' &&
				Number(asset.balance) > 0
			) {
				await enrichNomadexPool(pool);
			}

			// Nomadex uses live reserves; other tokens prefer the API's USD value.
			let tokenValue = 0;
			let tokenUsdValue = 0;

			if (
				pool?.provider !== 'nomadex' &&
				asset.usdValue != null &&
				asset.usdValue !== 'null' &&
				asset.usdValue !== ''
			) {
				let usdValuePerToken = parseFloat(asset.usdValue);
				if (!Number.isFinite(usdValuePerToken)) {
					usdValuePerToken = 0;
					partial = true;
				}
				const userTokenBalance = Number(asset.balance) / Math.pow(10, asset.decimals);

				// Calculate total USD value for user's holdings
				tokenUsdValue = usdValuePerToken * userTokenBalance;

				if (voiPriceUSD > 0) {
					// Convert total USD value to VOI equivalent
					tokenValue = tokenUsdValue / voiPriceUSD;
				} else {
					// No VOI price available - keep VOI value as 0
					tokenValue = 0;
				}
			} else if (pool && asset.assetType === 'arc200') {
				// Calculate value from pool data for ARC200 tokens
				const poolValue =
					pool.provider === 'nomadex' && Number(asset.balance) === 0
						? 0
						: calculateTokenValueFromPool(asset, pool);
				if (poolValue === null || !Number.isFinite(poolValue)) {
					partial = true;
				} else {
					tokenValue = poolValue;
				}

				// Calculate USD value for LP tokens
				if (voiPriceUSD > 0) {
					tokenUsdValue = tokenValue * voiPriceUSD;
				} else {
					tokenUsdValue = 0;
				}
			} else if (asset.assetType === 'asa' && asset.contractId === 302190) {
				// Special handling for aUSDC - 1:1 with USD
				const usdcAmount = Number(asset.balance) / Math.pow(10, asset.decimals);
				tokenUsdValue = usdcAmount; // 1 aUSDC = 1 USD

				if (voiPriceUSD > 0) {
					tokenValue = tokenUsdValue / voiPriceUSD;
				} else {
					tokenValue = 0;
				}
			}

			if (pool) {
				// This is an LP token - get more accurate token details
				const tokenADetails = unifiedAssetsData.balances.find(
					(b) => b.contractId.toString() === pool.tokAId
				);
				const tokenBDetails = unifiedAssetsData.balances.find(
					(b) => b.contractId.toString() === pool.tokBId
				);

				const tokenAInfo = getTokenInfo(pool.tokAId, tokenADetails, pool.symbolA, pool.decimalsA);
				const tokenBInfo = getTokenInfo(pool.tokBId, tokenBDetails, pool.symbolB, pool.decimalsB);

				let poolName = '';

				if (pool.provider === 'nomadex') {
					poolName = `${tokenAInfo.name}/${tokenBInfo.name} LP`;
				} else {
					// Humble pools
					poolName = `${pool.symbolA}/${pool.symbolB} LP`;
				}

				const lpToken: FungibleTokenType = {
					name: poolName,
					symbol: `${tokenAInfo.symbol}/${tokenBInfo.symbol}`,
					balance: Number(asset.balance),
					decimals: asset.decimals,
					verified: Boolean(asset.verified),
					imageUrl: asset.imageUrl,
					id: tokenId,
					poolId: pool.poolId,
					value: tokenValue,
					usdValue: tokenUsdValue,
					type: asset.assetType === 'asa' ? 'vsa' : 'arc200',
					approvals: approvalsMap.get(tokenId) || [],
					outgoingApprovals: outgoingApprovalsMap.get(tokenId) || [],
					poolInfo: {
						tokAId: pool.tokAId,
						tokBId: pool.tokBId,
						tokASymbol: tokenAInfo.symbol,
						tokBSymbol: tokenBInfo.symbol,
						tokABalance: pool.poolBalA,
						tokBBalance: pool.poolBalB,
						totalSupply: Number(pool.supply),
						poolId: pool.poolId,
						apr: pool.apr ?? 0,
						tokADecimals: tokenAInfo.decimals,
						tokBDecimals: tokenBInfo.decimals,
						tvl: pool.tvl,
						provider: pool.provider
					}
				};

				tokens.push(lpToken);
			} else {
				// Regular token (ARC200 or ASA)
				const regularToken: FungibleTokenType = {
					name: asset.name,
					symbol: asset.symbol,
					balance: Number(asset.balance),
					decimals: asset.decimals,
					verified: Boolean(asset.verified),
					imageUrl: asset.imageUrl,
					value: tokenValue,
					usdValue: tokenUsdValue,
					id: tokenId,
					type: asset.assetType === 'asa' ? 'vsa' : 'arc200',
					approvals: approvalsMap.get(tokenId) || [],
					outgoingApprovals: outgoingApprovalsMap.get(tokenId) || []
				};

				// Find a Humble pool to trade this token in (the link goes to humble.sh, TASK-97).
				// An emptied pool (LP supply 0) can't trade, and a token may sit in one beside
				// a live pool (TASK-33).
				for (const pool of liquidityPools) {
					if (pool.provider !== 'humble') continue;
					if (pool.supply !== '' && Number(pool.supply) === 0) continue;
					if (pool.tokAId === tokenId || pool.tokBId === tokenId) {
						regularToken.poolId = pool.poolId;
						break;
					}
				}

				tokens.push(regularToken);
			}
		}

		// Add tokens that only have approvals but no balance
		const balanceTokenIds = new Set(unifiedAssetsData.balances.map((b) => b.contractId.toString()));
		const approvalOnlyTokenIds = new Set(
			[...Array.from(approvalsMap.keys()), ...Array.from(outgoingApprovalsMap.keys())].filter(
				(id) => !balanceTokenIds.has(id)
			)
		);

		// For approval-only tokens, we need to fetch their details
		if (approvalOnlyTokenIds.size > 0) {
			try {
				const tokenDetailsUrl = new URL(
					'https://voi-mainnet-mimirapi.voirewards.com/arc200/tokens'
				);
				tokenDetailsUrl.searchParams.append(
					'contractId',
					Array.from(approvalOnlyTokenIds).join(',')
				);
				const tokenDetailsResponse = await fetchFn(tokenDetailsUrl.toString());

				if (tokenDetailsResponse.ok) {
					const tokenDetailsData = await tokenDetailsResponse.json();
					const tokenDetailsMap = new Map<string, ARC200Token>();

					if (tokenDetailsData.tokens) {
						tokenDetailsData.tokens.forEach((token: ARC200Token) => {
							tokenDetailsMap.set(token.contractId.toString(), token);
						});
					}

					for (const tokenId of approvalOnlyTokenIds) {
						const tokenDetails = tokenDetailsMap.get(tokenId);
						if (!tokenDetails) {
							partial = true;
							continue;
						}

						const pool = poolsMap.get(tokenId);

						if (pool) {
							// LP token with approvals but no balance
							const tokenADetails = unifiedAssetsData.balances.find(
								(b) => b.contractId.toString() === pool.tokAId
							);
							const tokenBDetails = unifiedAssetsData.balances.find(
								(b) => b.contractId.toString() === pool.tokBId
							);

							const tokenAInfo = getTokenInfo(
								pool.tokAId,
								tokenADetails,
								pool.symbolA,
								pool.decimalsA
							);
							const tokenBInfo = getTokenInfo(
								pool.tokBId,
								tokenBDetails,
								pool.symbolB,
								pool.decimalsB
							);

							const poolName =
								pool.provider === 'nomadex'
									? `${tokenAInfo.name}/${tokenBInfo.name} LP`
									: `${pool.symbolA}/${pool.symbolB} LP`;

							tokens.push({
								name: poolName,
								symbol: `${tokenAInfo.symbol}/${tokenBInfo.symbol}`,
								balance: 0,
								decimals: tokenDetails.decimals,
								verified: Boolean(tokenDetails.verified),
								imageUrl: `https://asset-verification.nautilus.sh/icons/${tokenId}.png`,
								id: tokenId,
								poolId: pool.poolId,
								value: 0,
								usdValue: 0,
								type: 'arc200',
								approvals: approvalsMap.get(tokenId) || [],
								outgoingApprovals: outgoingApprovalsMap.get(tokenId) || [],
								poolInfo: {
									tokAId: pool.tokAId,
									tokBId: pool.tokBId,
									tokASymbol: tokenAInfo.symbol,
									tokBSymbol: tokenBInfo.symbol,
									tokABalance: pool.poolBalA,
									tokBBalance: pool.poolBalB,
									totalSupply: Number(pool.supply),
									poolId: pool.poolId,
									apr: pool.apr ?? 0,
									tokADecimals: tokenAInfo.decimals,
									tokBDecimals: tokenBInfo.decimals,
									tvl: pool.tvl,
									provider: pool.provider
								}
							});
						} else {
							// Regular token with approvals but no balance
							tokens.push({
								name: tokenDetails.name,
								symbol: tokenDetails.symbol,
								balance: 0,
								decimals: tokenDetails.decimals,
								verified: Boolean(tokenDetails.verified),
								imageUrl: `https://asset-verification.nautilus.sh/icons/${tokenId}.png`,
								value: 0,
								usdValue: 0,
								id: tokenId,
								type: 'arc200',
								approvals: approvalsMap.get(tokenId) || [],
								outgoingApprovals: outgoingApprovalsMap.get(tokenId) || []
							});
						}
					}
				} else {
					partial = true;
				}
			} catch (err) {
				partial = true;
				console.warn('Failed to fetch details for approval-only tokens:', err);
			}
		}

		return { tokens, partial };
	} catch (err) {
		console.error('Error fetching fungible tokens:', err);
		throw new Error(`Failed to fetch token balances: ${err instanceof Error ? err.message : String(err)}`);
	}
}

function calculateTokenValueFromPool(asset: UnifiedAssetBalance, pool: PoolInfo): number | null {
	try {
		// Unknown live reserves or supply must not produce a Nomadex valuation.
		if (
			pool.provider === 'nomadex' &&
			![pool.poolBalA, pool.poolBalB, pool.supply].every((value) => /^\d+$/.test(value))
		) {
			return null;
		}
		// For LP tokens, calculate value based on user's share of the pool
		const userLpBalance = Number(asset.balance) / Math.pow(10, asset.decimals);
		const totalLpSupply = Number(pool.supply) / Math.pow(10, 6); // pool.supply needs to be converted from micro units

		if (totalLpSupply === 0) return 0;

		// Calculate user's share of the pool
		const userShare = userLpBalance / totalLpSupply;

		// Calculate VOI value based on pool TVL and user's share
		// For Nomadex pools, TVL might need to be adjusted for decimals
		let tvl = pool.tvl;
		if (pool.provider === 'nomadex') {
			// For Nomadex pools, TVL might be in microVOI (6 decimals)
			tvl = pool.tvl / Math.pow(10, 6);
		}

		const voiValue = tvl * userShare;

		return voiValue;
	} catch (err) {
		console.error('Error calculating token value:', err);
		return null;
	}
}
