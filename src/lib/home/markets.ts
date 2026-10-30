export type MarketRow = {
	exchange: string;
	pair: string;
	network: string;
	price: number;
	tvl: number;
	trading_pair_id: string | number;
};
export type Markets = {
	rows: MarketRow[];
	volume24h: number | null;
	liquidity: number | null;
	asOf: string;
};
type Response = {
	marketData?: unknown[];
	aggregates?: { totalVolume?: unknown; totalTvl?: unknown };
};
const positive = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0;

// Dust pools stay out of the table but still count in the summary totals (TASK-89). Measured
// 10-30: Voi pool TVLs run ... 117, 91, then 22, 21, 14 ...; $50 sits in that gap.
export const MARKET_TABLE_MIN_TVL_USD = 50;

export function topMarkets(res: Response, n = 4): MarketRow[] {
	const seen = new Set<string | number>();
	return (res.marketData ?? [])
		.filter((value): value is MarketRow => {
			if (!value || typeof value !== 'object') return false;
			const row = value as Partial<MarketRow>;
			return (
				positive(row.price) &&
				positive(row.tvl) &&
				row.tvl >= MARKET_TABLE_MIN_TVL_USD &&
				typeof row.exchange === 'string' &&
				typeof row.pair === 'string' &&
				typeof row.network === 'string' &&
				(typeof row.trading_pair_id === 'string' || typeof row.trading_pair_id === 'number')
			);
		})
		.sort((a, b) => b.tvl - a.tvl)
		.filter((row) => {
			if (seen.has(row.trading_pair_id)) return false;
			seen.add(row.trading_pair_id);
			return true;
		})
		.slice(0, Math.max(0, n));
}

export function marketsSummary(res: Response): Pick<Markets, 'volume24h' | 'liquidity'> {
	const volume = res.aggregates?.totalVolume;
	const liquidity = res.aggregates?.totalTvl;
	return {
		volume24h: res.marketData?.length && positive(volume) ? volume : null,
		liquidity: res.marketData?.length && positive(liquidity) ? liquidity : null
	};
}
