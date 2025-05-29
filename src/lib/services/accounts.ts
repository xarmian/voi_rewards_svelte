import { getLiquidityPools, type PoolInfo } from '$lib/services/lp';
import type { FungibleTokenType, TokenApproval, ARC200Token } from '$lib/types/assets';
import { algodClient } from '$lib/utils/algod';
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

export async function fetchFungibleTokens(walletAddress: string | undefined, voiPriceUSD: number = 0): Promise<FungibleTokenType[]> {
    if (!walletAddress) return [];

    console.log(`fetchFungibleTokens: VOI price = $${voiPriceUSD}`);

    try {
        // Fetch all data in parallel
        const [liquidityPools, unifiedAssetsResponse, approvalsResponse, outgoingApprovalsResponse] = await Promise.all([
            getLiquidityPools(),
            fetch(`https://voi-mainnet-mimirapi.nftnavigator.xyz/account/assets?accountId=${walletAddress}`),
            fetch(`https://voi-mainnet-mimirapi.voirewards.com/arc200/approvals?spender=${walletAddress}`),
            fetch(`https://voi-mainnet-mimirapi.voirewards.com/arc200/approvals?owner=${walletAddress}`)
        ]);
        
        if (!unifiedAssetsResponse.ok) throw new Error('Failed to fetch unified assets');
        const unifiedAssetsData: UnifiedAssetsResponse = await unifiedAssetsResponse.json();
        
        // Process approvals data
        const approvalsData = approvalsResponse.ok ? await approvalsResponse.json() : { approvals: [] };
        const outgoingApprovalsData = outgoingApprovalsResponse.ok ? await outgoingApprovalsResponse.json() : { approvals: [] };
        
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
        liquidityPools.forEach(pool => {
            poolsMap.set(pool.poolId, pool);
        });
        
        // Process tokens from unified API
        const tokens: FungibleTokenType[] = [];
        
        for (const asset of unifiedAssetsData.balances) {
            const tokenId = asset.contractId.toString();
            const pool = poolsMap.get(tokenId);
            
            // Calculate value - prefer USD value from API, fallback to pool calculation
            let tokenValue = 0;
            let tokenUsdValue = 0;
            
            if (asset.usdValue && asset.usdValue !== 'null') {
                const usdValuePerToken = parseFloat(asset.usdValue);
                const userTokenBalance = Number(asset.balance) / Math.pow(10, asset.decimals);
                
                // Calculate total USD value for user's holdings
                tokenUsdValue = usdValuePerToken * userTokenBalance;
                
                if (voiPriceUSD > 0) {
                    // Convert total USD value to VOI equivalent
                    tokenValue = tokenUsdValue / voiPriceUSD;
                    console.log(`Token ${asset.symbol}: ${userTokenBalance} tokens @ $${usdValuePerToken} each = $${tokenUsdValue} USD → ${tokenValue} VOI (price: $${voiPriceUSD})`);
                } else {
                    // No VOI price available - keep VOI value as 0
                    tokenValue = 0;
                    console.log(`Token ${asset.symbol}: ${userTokenBalance} tokens @ $${usdValuePerToken} each = $${tokenUsdValue} USD → 0 VOI (no price available)`);
                }
            } else if (pool && asset.assetType === 'arc200') {
                // Calculate value from pool data for ARC200 tokens
                tokenValue = calculateTokenValueFromPool(asset, pool);
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
                const tokenADetails = unifiedAssetsData.balances.find(b => b.contractId.toString() === pool.tokAId);
                const tokenBDetails = unifiedAssetsData.balances.find(b => b.contractId.toString() === pool.tokBId);
                
                // Handle special cases for VOI (ID 0 or 390001)
                const getTokenInfo = (tokenId: string, tokenDetails: UnifiedAssetBalance | undefined, fallbackSymbol?: string) => {
                    if (tokenId === '0') {
                        return {
                            symbol: 'VOI',
                            name: 'Voi',
                            decimals: 6
                        };
                    } else if (tokenId === '390001') {
                        return {
                            symbol: 'wVOI',
                            name: 'Wrapped Voi',
                            decimals: 6
                        };
                    } else if (tokenDetails) {
                        return {
                            symbol: tokenDetails.symbol,
                            name: tokenDetails.name,
                            decimals: tokenDetails.decimals
                        };
                    } else {
                        return {
                            symbol: fallbackSymbol || 'Unknown',
                            name: fallbackSymbol || 'Unknown',
                            decimals: 6
                        };
                    }
                };
                
                const tokenAInfo = getTokenInfo(pool.tokAId, tokenADetails, pool.symbolA);
                const tokenBInfo = getTokenInfo(pool.tokBId, tokenBDetails, pool.symbolB);
                
                let tvlBalance = 0;
                let poolName = '';
                
                if (pool.provider === 'nomadex') {
                    poolName = `${tokenAInfo.name}/${tokenBInfo.name} LP`;
                    const poolEscrowAddr = algosdk.getApplicationAddress(Number(pool.poolId));
                    try {
                        const poolEscrowInfo = await algodClient.accountInformation(poolEscrowAddr).do();
                        tvlBalance = poolEscrowInfo.amount * 2;
                    } catch (err) {
                        console.warn('Failed to fetch nomadex pool escrow info:', err);
                        tvlBalance = pool.tvl;
                    }
                } else {
                    // Humble pools
                    tvlBalance = pool.tvl;
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
                    value: tokenValue > 0 ? tokenValue : Number(tvlBalance * (Number(asset.balance) / Math.pow(10, asset.decimals)) / Number(pool.supply)),
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
                        totalSupply: Number(pool.supply) * (pool.provider === 'humble' ? Math.pow(10, 6) : 1),
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
                
                // Find if this token is tradeable in any pool
                for (const pool of liquidityPools) {
                    if (pool.tokAId === tokenId || pool.tokBId === tokenId) {
                        regularToken.poolId = pool.poolId;
                        break;
                    }
                }
                
                tokens.push(regularToken);
            }
        }
        
        // Add tokens that only have approvals but no balance
        const balanceTokenIds = new Set(unifiedAssetsData.balances.map(b => b.contractId.toString()));
        const approvalOnlyTokenIds = new Set([
            ...Array.from(approvalsMap.keys()),
            ...Array.from(outgoingApprovalsMap.keys())
        ].filter(id => !balanceTokenIds.has(id)));
        
        // For approval-only tokens, we need to fetch their details
        if (approvalOnlyTokenIds.size > 0) {
            try {
                const tokenDetailsUrl = new URL('https://voi-mainnet-mimirapi.voirewards.com/arc200/tokens');
                tokenDetailsUrl.searchParams.append('contractId', Array.from(approvalOnlyTokenIds).join(','));
                const tokenDetailsResponse = await fetch(tokenDetailsUrl.toString());
                
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
                        if (!tokenDetails) continue;
                        
                        const pool = poolsMap.get(tokenId);
                        
                        if (pool) {
                            // LP token with approvals but no balance
                            const tokenADetails = unifiedAssetsData.balances.find(b => b.contractId.toString() === pool.tokAId);
                            const tokenBDetails = unifiedAssetsData.balances.find(b => b.contractId.toString() === pool.tokBId);
                            
                            // Handle special cases for VOI (ID 0 or 390001)
                            const getTokenInfo = (tokenId: string, tokenDetails: UnifiedAssetBalance | undefined, fallbackSymbol?: string) => {
                                if (tokenId === '0') {
                                    return {
                                        symbol: 'VOI',
                                        name: 'Voi',
                                        decimals: 6
                                    };
                                } else if (tokenId === '390001') {
                                    return {
                                        symbol: 'wVOI',
                                        name: 'Wrapped Voi',
                                        decimals: 6
                                    };
                                } else if (tokenDetails) {
                                    return {
                                        symbol: tokenDetails.symbol,
                                        name: tokenDetails.name,
                                        decimals: tokenDetails.decimals
                                    };
                                } else {
                                    return {
                                        symbol: fallbackSymbol || 'Unknown',
                                        name: fallbackSymbol || 'Unknown',
                                        decimals: 6
                                    };
                                }
                            };
                            
                            const tokenAInfo = getTokenInfo(pool.tokAId, tokenADetails, pool.symbolA);
                            const tokenBInfo = getTokenInfo(pool.tokBId, tokenBDetails, pool.symbolB);
                            
                            const poolName = pool.provider === 'nomadex' 
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
                                type: tokenDetails.type === 'arc200' ? 'arc200' : 'vsa',
                                approvals: approvalsMap.get(tokenId) || [],
                                outgoingApprovals: outgoingApprovalsMap.get(tokenId) || [],
                                poolInfo: {
                                    tokAId: pool.tokAId,
                                    tokBId: pool.tokBId,
                                    tokASymbol: tokenAInfo.symbol,
                                    tokBSymbol: tokenBInfo.symbol,
                                    tokABalance: pool.poolBalA,
                                    tokBBalance: pool.poolBalB,
                                    totalSupply: Number(pool.supply) * (pool.provider === 'humble' ? Math.pow(10, 6) : 1),
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
                                type: tokenDetails.type === 'arc200' ? 'arc200' : 'vsa',
                                approvals: approvalsMap.get(tokenId) || [],
                                outgoingApprovals: outgoingApprovalsMap.get(tokenId) || []
                            });
                        }
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch details for approval-only tokens:', err);
            }
        }
        
        return tokens;
        
    } catch (err) {
        console.error('Error fetching fungible tokens:', err);
        return [];
    }
}

function calculateTokenValueFromPool(asset: UnifiedAssetBalance, pool: PoolInfo): number {
    try {
        // Get pool balances based on whether VOI is token A or B
        const voiBalance = (pool.tokAId === '0' || pool.tokAId === '390001') ? pool.poolBalA : pool.poolBalB;
        const tokenBalance = (pool.tokAId === '0' || pool.tokAId === '390001') ? pool.poolBalB : pool.poolBalA;
        
        if (tokenBalance === '0' || voiBalance === '0') return 0;

        // Calculate price in VOI
        const priceInVoi = Number(voiBalance) / Number(tokenBalance);
        
        // Calculate value based on user's token balance and decimals
        const userBalance = Number(asset.balance) / Math.pow(10, asset.decimals);
        return userBalance * priceInVoi;
    } catch (err) {
        console.error('Error calculating token value:', err);
        return 0;
    }
}
