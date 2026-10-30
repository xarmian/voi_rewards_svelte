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
	/** Side decimals, when the source reports them (Mimir's Humble pools do). */
	decimalsA?: number;
	decimalsB?: number;
}

interface NomadexLivePool {
	poolId: number;
	tokenA: { id: number; balance: string; symbol: string };
	tokenB: { id: number; balance: string; symbol: string };
	outstandingLpAmount: string;
}

interface HumblePoolResponse {
	'current-round': number;
	pools: HumblePoolInfo[];
}

interface HumblePoolToken {
	id: number;
	type: string;
	symbol: string;
	balance: string;
	decimals: number;
	volume24h?: string;
}

/** Mimir /dex/pools as served (checked live 2026-10-30, TASK-33). It has no APR. */
interface HumblePoolInfo {
	poolId: number;
	tokenA: HumblePoolToken;
	tokenB: HumblePoolToken;
	exchange: string;
	escrowAddress: string;
	outstandingLpAmount: string;
}

// wVOI (390001) stands in for VOI, which consumers key as '0'.
const humbleTokenId = (id: number) => (id === 390001 ? '0' : id.toString());

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
		tokAId: humbleTokenId(pool.tokenA.id),
		tokBId: humbleTokenId(pool.tokenB.id),
		poolBalA: pool.tokenA.balance,
		poolBalB: pool.tokenB.balance,
		supply: pool.outstandingLpAmount,
		provider: pool.exchange,
		tvl: 0,
		symbolA: pool.tokenA.id === 390001 ? 'VOI' : pool.tokenA.symbol,
		symbolB: pool.tokenB.id === 390001 ? 'VOI' : pool.tokenB.symbol,
		decimalsA: pool.tokenA.decimals,
		decimalsB: pool.tokenB.decimals
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
