import { nomadexPools } from './nomadexPools';

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

interface NomadexLivePool {
	poolId: number;
	tokenA: { id: number; balance: string; symbol: string };
	tokenB: { id: number; balance: string; symbol: string };
	outstandingLpAmount: string;
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

/** Get Humble pools and enrich immutable Nomadex metadata with live Mimir state. */
export const getLiquidityPools = async (fetchFn: typeof fetch = fetch) => {
	const [nautilusResponse, nomadexData] = await Promise.all([
		fetchFn('https://voi-mainnet-mimirapi.voirewards.com/dex/pools?tokenId=390001'),
		fetchFn('https://voi-mainnet-mimirapi.voirewards.com/dex/pools?exchange=nomadex&limit=500')
			.then(async (response) => {
				if (!response.ok) throw new Error(`Nomadex pools HTTP ${response.status}`);
				const data: { pools: NomadexLivePool[] } = await response.json();
				return data.pools;
			})
			.catch((error) => {
				console.warn('Failed to fetch live Nomadex pools; using escrow reads for held LPs:', error);
				return [] as NomadexLivePool[];
			})
	]);
	const humbleData: HumblePoolResponse = await nautilusResponse.json();

	const humblePools: PoolInfo[] = humbleData.pools.map((pool) => ({
		poolId: pool.poolId.toString(),
		tokAId: pool.tokenA.id === 390001 ? 0 : pool.tokenA.id,
		tokBId: pool.tokenB.id === 390001 ? 0 : pool.tokenB.id,
		poolBalA: pool.tokenA.balance,
		poolBalB: pool.tokenB.balance,
		supply: pool.outstandingLpAmount,
		provider: pool.exchange,
		tvl: 0,
		apr: Number(pool.apr),
		symbolA: pool.tokenA.id === 390001 ? 'VOI' : pool.tokenA.symbol,
		symbolB: pool.tokenB.id === 390001 ? 'VOI' : pool.tokenB.symbol
	}));

	const livePools = new Map(nomadexData.map((pool) => [pool.poolId, pool]));
	const enrichedNomadexPools: PoolInfo[] = nomadexPools.map((pool) => {
		const livePool = livePools.get(pool.id);
		const sides = [livePool?.tokenA, livePool?.tokenB];
		const alpha = sides.find((token) => token?.id === pool.alphaId);
		const beta = sides.find((token) => token?.id === pool.betaId);
		const poolBalA = alpha?.balance ?? '';
		const poolBalB = beta?.balance ?? '';

		return {
			poolId: pool.id.toString(),
			tokAId: pool.alphaId.toString(),
			tokBId: pool.betaId.toString(),
			poolBalA,
			poolBalB,
			supply: livePool?.outstandingLpAmount ?? '',
			provider: 'nomadex',
			tvl:
				pool.alphaType === 0
					? Number(poolBalA) * 2
					: pool.betaType === 0
						? Number(poolBalB) * 2
						: 0,
			apr: 0,
			symbolA: alpha?.symbol,
			symbolB: beta?.symbol
		};
	});

	return [...humblePools, ...enrichedNomadexPools];
};

export default getLiquidityPools;
