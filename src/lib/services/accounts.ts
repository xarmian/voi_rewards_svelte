import { getLiquidityPools, type PoolInfo } from '$lib/services/lp';
import type { FungibleTokenType, TokenApproval, TokenBalance, ARC200Token } from '$lib/types/assets';
import { algodClient } from '$lib/utils/algod';
import algosdk from 'algosdk';

export async function fetchFungibleTokens(walletAddress: string | undefined): Promise<FungibleTokenType[]> {
    if (!walletAddress) return [];

    const poolData: Map<string, any> = await fetchPoolData();
    
    try {
        // Create URLs for both API endpoints
        const balancesUrl = new URL('https://voi-mainnet-mimirapi.voirewards.com/arc200/balances');
        balancesUrl.searchParams.append('accountId', walletAddress);
        
        const approvalsUrl = new URL('https://voi-mainnet-mimirapi.voirewards.com/arc200/approvals');
        approvalsUrl.searchParams.append('spender', walletAddress);
        
        const outgoingApprovalsUrl = new URL('https://voi-mainnet-mimirapi.voirewards.com/arc200/approvals');
        outgoingApprovalsUrl.searchParams.append('owner', walletAddress);
        
        // Fetch liquidity pools and all API endpoints in parallel
        const [liquidityPools, balancesResponse, approvalsResponse, outgoingApprovalsResponse] = await Promise.all([
            getLiquidityPools(),
            fetch(balancesUrl.toString()),
            fetch(approvalsUrl.toString()),
            fetch(outgoingApprovalsUrl.toString())
        ]);
        
        if (!balancesResponse.ok) throw new Error('Failed to fetch fungible tokens');
        const balancesData = await balancesResponse.json();
        
        // Process approvals data
        const approvalsData = await approvalsResponse.json();
        
        // Process outgoing approvals data
        const outgoingApprovalsData = await outgoingApprovalsResponse.json();
        
        // Create a map of approvals by contractId for easy lookup
        const approvalsMap = new Map();
        if (approvalsResponse.ok && approvalsData.approvals) {
            approvalsData.approvals.filter((approval: TokenApproval) => approval.amount !== '0').forEach((approval: TokenApproval) => {
                const contractId = approval.contractId.toString();
                if (!approvalsMap.has(contractId)) {
                    approvalsMap.set(contractId, []);
                }
                approvalsMap.get(contractId).push(approval);
            });
        }
        
        // Create a map of outgoing approvals by contractId
        const outgoingApprovalsMap = new Map();
        if (outgoingApprovalsResponse.ok && outgoingApprovalsData.approvals) {
            outgoingApprovalsData.approvals.filter((approval: TokenApproval) => approval.amount !== '0').forEach((approval: TokenApproval) => {
                const contractId = approval.contractId.toString();
                if (!outgoingApprovalsMap.has(contractId)) {
                    outgoingApprovalsMap.set(contractId, []);
                }
                outgoingApprovalsMap.get(contractId).push({
                    spender: approval.spender,
                    amount: approval.amount,
                    timestamp: approval.timestamp,
                    contractId: approval.contractId,
                    transactionId: approval.transactionId
                });
            });
        }
        
        // for each liquidity pool, get tokA and tokB
        const lpTokenIds = liquidityPools.map((p: PoolInfo) => p.tokAId).concat(liquidityPools.map((p: PoolInfo) => p.tokBId));
        
        // Get balance token IDs
        const balanceTokenIds = balancesData.balances.map((token: TokenBalance) => token.contractId.toString());
        
        // Get approval token IDs
        const approvalTokenIds = Array.from(approvalsMap.keys());
        
        // Get outgoing approval token IDs
        const outgoingApprovalTokenIds = Array.from(outgoingApprovalsMap.keys());
        
        // Merge all token IDs into a unique set
        const contractIds = new Set([...lpTokenIds, ...balanceTokenIds, ...approvalTokenIds, ...outgoingApprovalTokenIds]);
        
        // Fetch token details for all tokens in one request
        const tokenDetailsUrl = new URL('https://voi-mainnet-mimirapi.voirewards.com/arc200/tokens');
        tokenDetailsUrl.searchParams.append('contractId', Array.from(contractIds).join(','));
        const tokenDetailsResponse = await fetch(tokenDetailsUrl.toString());
        const tokenDetailsData = await tokenDetailsResponse.json();

        // Create a map of token details by contractId for easy lookup
        const tokenDetailsMap = new Map();
        if (tokenDetailsResponse.ok && tokenDetailsData.tokens) {
            tokenDetailsData.tokens.forEach((token: ARC200Token) => {
                tokenDetailsMap.set(token.contractId.toString(), token);
            });
        }

        tokenDetailsMap.set('0', {
            name: 'VOI',
            symbol: 'VOI',
            decimals: 6
        });

        // Process regular tokens first
        const tokenPromises = balancesData.balances.map(async (token: any) => {
            const tokenId = token.contractId.toString();
            const tokenDetails = tokenDetailsMap.get(tokenId);
            const pool = liquidityPools.find((p: PoolInfo) => p.poolId === tokenId);

            if (pool) {
                // This is an LP token
                const tokenA = tokenDetailsMap.get(pool.tokAId);
                const tokenB = tokenDetailsMap.get(pool.tokBId);

                let tvlBalance = 0;
                let poolName = `${tokenA?.name}/${tokenB?.name} LP`;

                if (pool.provider === 'nomadex') {
                    const poolEscrowAddr = algosdk.getApplicationAddress(Number(pool.poolId));
                    const poolEscrowInfo = await algodClient.accountInformation(poolEscrowAddr).do();
                    tvlBalance = poolEscrowInfo.amount * 2;
                } else {
                    tvlBalance = pool.tvl;
                    poolName = `${pool.symbolA}/${pool.symbolB} LP`;
                }

                const poolData = {
                    name: poolName,
                    symbol: `${tokenA?.symbol}/${tokenB?.symbol}`,
                    balance: token.balance,
                    decimals: token.decimals,
                    verified: token.verified,
                    imageUrl: `https://asset-verification.nautilus.sh/icons/${tokenId}.png`,
                    id: tokenId,
                    poolId: pool.poolId,
                    value: Number(tvlBalance * (Number(token.balance / Math.pow(10, token.decimals)) / Number(pool.supply))),
                    type: 'arc200',
                    creator: tokenDetails?.creator,
                    totalSupply: pool.supply,
                    approvals: approvalsMap.get(tokenId) || [],
                    outgoingApprovals: outgoingApprovalsMap.get(tokenId) || [],
                    poolInfo: {
                        tokAId: pool.tokAId,
                        tokBId: pool.tokBId,
                        tokASymbol: tokenA?.symbol,
                        tokBSymbol: tokenB?.symbol,
                        tokABalance: pool.poolBalA,
                        tokBBalance: pool.poolBalB,
                        totalSupply: Number(pool.supply) * (pool.provider === 'humble' ? Math.pow(10, 6) : 1),
                        poolId: pool.poolId,
                        apr: pool.apr ?? 0,
                        tokADecimals: tokenA?.decimals,
                        tokBDecimals: tokenB?.decimals,
                        tvl: pool.tvl,
                        provider: pool.provider
                    }
                };

                return poolData;
            }

            // Find if this token is in any pool for trading
            const poolForToken = Array.from(poolData.values()).find(p => 
                p.tokAId === tokenId || p.tokBId === tokenId
            );

            return {
                name: tokenDetails?.name || token.symbol,
                symbol: token.symbol,
                balance: token.balance,
                decimals: token.decimals,
                verified: token.verified,
                imageUrl: `https://asset-verification.nautilus.sh/icons/${tokenId}.png`,
                value: tokenDetails?.tokenId === '0' ? token.balance / 1e6 : calculateTokenValue(token, poolForToken),
                id: tokenId,
                poolId: poolForToken?.contractId?.toString(),
                type: 'arc200',
                creator: tokenDetails?.creator,
                totalSupply: tokenDetails?.totalSupply,
                approvals: approvalsMap.get(tokenId) || [],
                outgoingApprovals: outgoingApprovalsMap.get(tokenId) || []
            };
        });
        
        // Process tokens with approvals but no balance (not already in the balancesData)
        const approvalOnlyPromises = [...approvalTokenIds, ...outgoingApprovalTokenIds]
            .filter(id => !balanceTokenIds.includes(id)) // Only unique tokens not in balances
            .map(async (tokenId) => {
                const tokenDetails = tokenDetailsMap.get(tokenId);
                if (!tokenDetails) return null; // Skip if no details

                const pool = liquidityPools.find((p: PoolInfo) => p.poolId === tokenId);
                if (pool) {
                    // This is an LP token with approvals but no balance
                    const tokenA = tokenDetailsMap.get(pool.tokAId);
                    const tokenB = tokenDetailsMap.get(pool.tokBId);

                    const poolName = pool.provider === 'nomadex' 
                        ? `${tokenA?.name}/${tokenB?.name} LP`
                        : `${pool.symbolA}/${pool.symbolB} LP`;

                    return {
                        name: poolName,
                        symbol: `${tokenA?.symbol}/${tokenB?.symbol}`,
                        balance: 0, // No balance
                        decimals: tokenDetails.decimals || 0,
                        verified: true,
                        imageUrl: `https://asset-verification.nautilus.sh/icons/${tokenId}.png`,
                        id: tokenId,
                        poolId: pool.poolId,
                        value: 0, // No value
                        type: 'arc200',
                        creator: tokenDetails.creator,
                        totalSupply: pool.supply,
                        approvals: approvalsMap.get(tokenId) || [],
                        outgoingApprovals: outgoingApprovalsMap.get(tokenId) || [],
                        poolInfo: {
                            tokAId: pool.tokAId,
                            tokBId: pool.tokBId,
                            tokASymbol: tokenA?.symbol,
                            tokBSymbol: tokenB?.symbol,
                            tokABalance: pool.poolBalA,
                            tokBBalance: pool.poolBalB,
                            totalSupply: Number(pool.supply) * (pool.provider === 'humble' ? Math.pow(10, 6) : 1),
                            poolId: pool.poolId,
                            apr: pool.apr ?? 0,
                            tokADecimals: tokenA?.decimals,
                            tokBDecimals: tokenB?.decimals,
                            tvl: pool.tvl,
                            provider: pool.provider
                        }
                    };
                }

                // Find if this token is in any pool for trading
                const poolForToken = Array.from(poolData.values()).find(p => 
                    p.tokAId === tokenId || p.tokBId === tokenId
                );

                return {
                    name: tokenDetails.name || tokenDetails.symbol,
                    symbol: tokenDetails.symbol,
                    balance: 0, // No balance
                    decimals: tokenDetails.decimals || 0,
                    verified: true,
                    imageUrl: `https://asset-verification.nautilus.sh/icons/${tokenId}.png`,
                    value: 0, // No value
                    id: tokenId,
                    poolId: poolForToken?.contractId?.toString(),
                    type: 'arc200',
                    creator: tokenDetails.creator,
                    totalSupply: tokenDetails.totalSupply,
                    approvals: approvalsMap.get(tokenId) || [],
                    outgoingApprovals: outgoingApprovalsMap.get(tokenId) || []
                };
            });
            
        // Combine regular tokens and approval-only tokens
        const allTokenPromises = [...tokenPromises, ...approvalOnlyPromises];
        const allTokens = await Promise.all(allTokenPromises);
        
        // Filter out null values and update state
        return allTokens.filter(Boolean);
        
    } catch (err) {
        console.error('Error fetching fungible tokens:', err);
    }

    return [];
}

function calculateTokenValue(token: any, pool: any): number {
    if (!pool) return 0;

    try {
        // Get pool balances based on whether VOI is token A or B
        const voiBalance = (pool.tokAId === '0' || pool.tokAId === '390001') ? pool.poolBalA : pool.poolBalB;
        const tokenBalance = (pool.tokAId === '0' || pool.tokAId === '390001') ? pool.poolBalB : pool.poolBalA;
        
        if (tokenBalance === '0' || voiBalance === '0') return 0;

        // Calculate price in VOI
        const priceInVoi = Number(voiBalance) / Number(tokenBalance);
        
        // Calculate value based on user's token balance and decimals
        const userBalance = token.balance / (10 ** token.decimals);
        return userBalance * priceInVoi;
    } catch (err) {
        console.error('Error calculating token value:', err);
        return 0;
    }
}

async function fetchPoolData(): Promise<Map<string, any>> {
    const poolData: Map<string, any> = new Map();

    try {
        const response = await fetch('https://mainnet-idx.nautilus.sh/nft-indexer/v1/dex/pools?tokenId=390001');
        if (!response.ok) throw new Error('Failed to fetch pool data');
        const data = await response.json();
        
        // Store pool data by pool contractId
        data.pools.forEach((pool: any) => {
            // Skip deleted pools
            if (pool.deleted) return;
            
            // Store pool by its contractId
            poolData.set(pool.contractId.toString(), pool);
        });
    } catch (err) {
        console.error('Error fetching pool data:', err);
    }

    return poolData;
}
