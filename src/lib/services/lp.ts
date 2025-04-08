export interface PoolInfo {
    poolId: string;
    tokAId: string;
    tokBId: string;
    poolBalA: string;
    poolBalB: string;
    supply: string;
    tvl: number;
    provider: string;
    apr?: number;
    symbolA?: string;
    symbolB?: string;
}

interface NomadexPoolInfo {
    id: number;
    alphaId: number;
    alphaType: number;
    betaId: number;
    betaType: number;
    swapFee: string;
    balances: number[]; // do not use, use balance.alpha and balance.beta instead
    volume: number[];
    apr: number;
    online: boolean;
    balance: {
        lpt: string;
        issuedLpt: string;
        alpha: string;
        beta: string;
    };
}

interface HumblePoolResponse {
    currentRound: number;
    pools: HumblePoolInfo[];
}

interface HumblePoolInfo {
    contractId: number;
    providerId: string;
    poolId: string;
    tokAId: string;
    tokBId: string;
    symbolA: string;
    symbolB: string;
    poolBalA: string;
    poolBalB: string;
    tvlA: string;
    tvlB: string;
    volA: string;
    volB: string;
    apr: string;
    supply: string;
    deleted: number;
    tokADecimals: number;
    tokBDecimals: number;
    tvl: number;
    creator: string;
    mintRound: number;
}

/**
 * Get all liquidity pools from both Nautilus API (humble) and Nomadex API (nomadex)
 * @returns {Promise<any>}
 */
export const getLiquidityPools = async () => {
    const pools: PoolInfo[] = [];

    await Promise.all([
        fetch('https://mainnet-idx.nautilus.sh/nft-indexer/v1/dex/pools?tokenId=390001'),
        fetch('https://api.voirewards.com/nomadex/index.php')
    ]).then(async ([nautilusResponse, nomadexResponse]) => {
        const humbleData: HumblePoolResponse = await nautilusResponse.json();
        const nomadexData: NomadexPoolInfo[] = await nomadexResponse.json();

        // convert humbleData to PoolInfo
        const humblePools: PoolInfo[] = humbleData.pools.map((pool) => ({
            poolId: pool.contractId.toString(),
            tokAId: pool.tokAId,
            tokBId: pool.tokBId,
            poolBalA: pool.poolBalA,
            poolBalB: pool.poolBalB,
            supply: pool.supply,
            provider: 'humble',
            tvl: pool.tvl,
            apr: Number(pool.apr),
            symbolA: pool.symbolA,
            symbolB: pool.symbolB
        }));

        // convert nomadexData to PoolInfo
        const nomadexPools: PoolInfo[] = nomadexData.map((pool) => ({
            poolId: pool.id.toString(),
            tokAId: pool.alphaId.toString(),
            tokBId: pool.betaId.toString(),
            poolBalA: pool.balance.alpha,
            poolBalB: pool.balance.beta,
            supply: pool.balance.issuedLpt,
            provider: 'nomadex',
            tvl: pool.alphaId === 0 ? Number(pool.balance.alpha) * 2 : (pool.betaId === 0) ? Number(pool.balance.beta) * 2 : 0,
            apr: pool.apr
        }));

        // merge the two arrays
        pools.push(...humblePools);
        pools.push(...nomadexPools);

    });

    return pools;
}

export default getLiquidityPools;