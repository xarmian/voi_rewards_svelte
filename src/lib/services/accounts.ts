import { getLiquidityPools, type PoolInfo } from '$lib/services/lp';
import { fetchFungibleTokens as fetchFungibleTokensCore } from './fungibleTokens.ts';

export function fetchFungibleTokens(
	walletAddress: string | undefined,
	voiPriceUSD: number = 0,
	deps: { getLiquidityPools?: () => Promise<PoolInfo[]>; fetch?: typeof fetch } = {}
) {
	return fetchFungibleTokensCore(walletAddress, voiPriceUSD, {
		getLiquidityPools: deps.getLiquidityPools ?? getLiquidityPools,
		fetch: deps.fetch ?? fetch
	});
}
