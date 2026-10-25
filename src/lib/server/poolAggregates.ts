// TASK-52, C11, P06: consume Mimir aggregates without downloading individual swaps.
export interface PoolSide {
	base_token_id: number;
	quote_token_id: number;
	swaps_24h: number;
	volume_base_24h: number;
	volume_quote_24h: number;
	volume_base_24h_priced: number;
	volume_quote_24h_priced: number;
	volume_base_7d: number;
	volume_quote_7d: number;
	volume_base_30d: number;
	volume_quote_30d: number;
}

export interface PoolAggregate {
	pool_id: number;
	latest_ts: string | null;
	latest_round: number | null;
	latest_base_token_id: number | null;
	latest_quote_token_id: number | null;
	latest_price_quote: number | null;
	latest_poolbal_a: number | null;
	latest_poolbal_b: number | null;
	swaps_24h: number;
	traders_24h: number;
	first_24h_base_token_id: number | null;
	first_24h_quote_token_id: number | null;
	first_24h_price_quote: number | null;
	last_24h_base_token_id: number | null;
	last_24h_quote_token_id: number | null;
	last_24h_price_quote: number | null;
	sides: PoolSide[];
}

export async function fetchPoolAggregates(
	client: { rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: unknown }> },
	poolIds: number[]
): Promise<Map<number, PoolAggregate>> {
	const ids = [...new Set(poolIds)];
	const chunks: number[][] = [];
	for (let i = 0; i < ids.length; i += 100) {
		chunks.push(ids.slice(i, i + 100));
	}
	const results = await Promise.all(
		chunks.map(async (p_pool_ids) => {
			const { data, error } = await client.rpc('get_pool_aggregates', { p_pool_ids });
			if (error) throw error;
			return (data || []) as PoolAggregate[];
		})
	);
	return new Map(results.flat().map((agg) => [agg.pool_id, agg]));
}

export function poolVolumeMetrics(agg: PoolAggregate | undefined) {
	let volume24h = 0;
	let volume7d = 0;
	let volume30d = 0;
	let volumeTokenA24h = 0;
	let volumeTokenB24h = 0;
	for (const side of agg?.sides || []) {
		volume24h += side.volume_base_24h + side.volume_quote_24h;
		volume7d += side.volume_base_7d + side.volume_quote_7d;
		volume30d += side.volume_base_30d + side.volume_quote_30d;
		volumeTokenA24h += side.volume_base_24h;
		volumeTokenB24h += side.volume_quote_24h;
	}
	return {
		volume24h,
		volume7d,
		volume30d,
		volumeTokenA24h,
		volumeTokenB24h,
		swapCount24h: agg?.swaps_24h || 0,
		uniqueTraders24h: agg?.traders_24h || 0
	};
}

export function poolLatestReserves(agg: PoolAggregate | undefined) {
	if (!agg || agg.latest_round === null) return null;
	return { reserveA: agg.latest_poolbal_a || 0, reserveB: agg.latest_poolbal_b || 0 };
}

export function tokenVolumeMetrics(aggs: Iterable<PoolAggregate>, allIds: number[]) {
	let volume24h = 0;
	let volume7d = 0;
	let volume30d = 0;
	for (const agg of aggs) {
		for (const side of agg.sides) {
			if (allIds.includes(side.base_token_id)) {
				volume24h += side.volume_base_24h;
				volume7d += side.volume_base_7d;
				volume30d += side.volume_base_30d;
			}
			if (allIds.includes(side.quote_token_id)) {
				volume24h += side.volume_quote_24h;
				volume7d += side.volume_quote_7d;
				volume30d += side.volume_quote_30d;
			}
		}
	}
	return { volume24h, volume7d, volume30d };
}

export function tokenTvlMetrics(aggs: Iterable<PoolAggregate>, allIds: number[]) {
	let totalTvl = 0;
	let poolCount = 0;
	for (const agg of aggs) {
		if (agg.latest_round === null) continue;
		const hasBase = agg.latest_base_token_id !== null && allIds.includes(agg.latest_base_token_id);
		const hasQuote =
			agg.latest_quote_token_id !== null && allIds.includes(agg.latest_quote_token_id);
		if (!hasBase && !hasQuote) continue;
		if (hasBase) totalTvl += agg.latest_poolbal_a || 0;
		if (hasQuote) totalTvl += agg.latest_poolbal_b || 0;
		poolCount++;
	}
	return { totalTvl, poolCount };
}

export function latestSwapRow(agg: PoolAggregate | undefined) {
	if (!agg || agg.latest_round === null) return undefined;
	return {
		pool_id: agg.pool_id,
		ts: agg.latest_ts,
		base_token_id: agg.latest_base_token_id,
		quote_token_id: agg.latest_quote_token_id,
		price_quote: agg.latest_price_quote,
		poolbal_a: agg.latest_poolbal_a,
		poolbal_b: agg.latest_poolbal_b
	};
}

export function pairWindow(
	agg: PoolAggregate | undefined,
	baseTokenId: number,
	quoteTokenId: number
) {
	let volQuoteSum = 0;
	for (const side of agg?.sides || []) {
		if (side.base_token_id === baseTokenId && side.quote_token_id === quoteTokenId) {
			volQuoteSum += side.volume_quote_24h;
		} else if (side.base_token_id === quoteTokenId && side.quote_token_id === baseTokenId) {
			// TASK-52, C11, P06: reversed swaps counted volume only when their price was positive.
			volQuoteSum += side.volume_base_24h_priced;
		}
	}
	function orientPrice(base: number | null, quote: number | null, price: number | null) {
		if (price === null) return null;
		if (base === baseTokenId && quote === quoteTokenId) return price;
		if (base === quoteTokenId && quote === baseTokenId) return 1 / price;
		return null;
	}
	return {
		volQuoteSum,
		firstPrice: agg
			? orientPrice(
					agg.first_24h_base_token_id,
					agg.first_24h_quote_token_id,
					agg.first_24h_price_quote
				)
			: null,
		lastPrice: agg
			? orientPrice(
					agg.last_24h_base_token_id,
					agg.last_24h_quote_token_id,
					agg.last_24h_price_quote
				)
			: null
	};
}

export function tokenMetricsOrUnavailable(
	aggregates: Map<number, PoolAggregate> | null,
	allIds: number[]
) {
	if (aggregates === null) {
		return {
			volume: { volume24h: null, volume7d: null, volume30d: null },
			tvl: { totalTvl: null, poolCount: null }
		};
	}
	return {
		volume: tokenVolumeMetrics(aggregates.values(), allIds),
		tvl: tokenTvlMetrics(aggregates.values(), allIds)
	};
}

export function poolMetricsOrUnavailable(agg: PoolAggregate | undefined, failed: boolean) {
	if (failed) {
		return {
			volume24h: null,
			volume7d: null,
			volume30d: null,
			volumeTokenA24h: null,
			volumeTokenB24h: null,
			swapCount24h: null,
			uniqueTraders24h: null
		};
	}
	return poolVolumeMetrics(agg);
}
