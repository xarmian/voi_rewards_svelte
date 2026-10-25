import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	fetchPoolAggregates,
	latestSwapRow,
	pairWindow,
	poolLatestReserves,
	poolVolumeMetrics,
	tokenTvlMetrics,
	tokenVolumeMetrics,
	type PoolAggregate
} from './poolAggregates.ts';

interface SwapRow {
	id: number;
	pool_id: number;
	ts: string;
	base_token_id: number;
	quote_token_id: number;
	price_quote: number | null;
	poolbal_a: number | null;
	poolbal_b: number | null;
	volume_base: number | null;
	volume_quote: number | null;
	trader_hex: string | null;
}

const fixture: { now: string; rows: SwapRow[]; aggregates: PoolAggregate[] } = JSON.parse(
	readFileSync(new URL('./__fixtures__/poolAggregates.json', import.meta.url), 'utf8')
);
const { rows, now, aggregates } = fixture;
const byPool = new Map(aggregates.map((agg) => [agg.pool_id, agg]));
const poolIds = [...new Set([...rows.map((row) => row.pool_id), ...byPool.keys()])];

function inWindow(rows: SwapRow[], now: string, days: number) {
	return rows.filter(
		(row) => new Date(row.ts).getTime() >= new Date(now).getTime() - days * 24 * 60 * 60 * 1000
	);
}

function sortedRows(rows: SwapRow[], ascending: boolean) {
	return [...rows].sort(
		(a, b) =>
			(ascending ? 1 : -1) * (new Date(a.ts).getTime() - new Date(b.ts).getTime() || a.id - b.id)
	);
}

// TASK-52, C11, P06: preserve the old endpoint aggregation logic as parity references.
function oldPoolVolumeMetrics(rows: SwapRow[], now: string) {
	const volume24hData = inWindow(rows, now, 1);
	const volume7dData = inWindow(rows, now, 7);
	const volume30dData = inWindow(rows, now, 30);
	// Process 24h data for detailed metrics
	const volume24h = (volume24hData || []).reduce((total, swap) => {
		return total + (swap.volume_base || 0) + (swap.volume_quote || 0);
	}, 0);

	const volumeTokenA24h = (volume24hData || []).reduce((total, swap) => {
		return total + (swap.volume_base || 0);
	}, 0);

	const volumeTokenB24h = (volume24hData || []).reduce((total, swap) => {
		return total + (swap.volume_quote || 0);
	}, 0);

	const swapCount24h = volume24hData?.length || 0;
	const uniqueTraders24h = new Set((volume24hData || []).map((swap) => swap.trader_hex)).size;

	// Calculate 7d and 30d volumes
	const volume7d = (volume7dData || []).reduce((total, swap) => {
		return total + (swap.volume_base || 0) + (swap.volume_quote || 0);
	}, 0);

	const volume30d = (volume30dData || []).reduce((total, swap) => {
		return total + (swap.volume_base || 0) + (swap.volume_quote || 0);
	}, 0);

	return {
		volume24h,
		volume7d,
		volume30d,
		volumeTokenA24h,
		volumeTokenB24h,
		swapCount24h,
		uniqueTraders24h
	};
}

function oldPoolReserves(rows: SwapRow[]) {
	const data = sortedRows(rows, false)[0];
	if (!data) return null;
	return {
		reserveA: data.poolbal_a || 0,
		reserveB: data.poolbal_b || 0
	};
}

function aggregateVolume(
	swaps: Array<{
		volume_base: number | null;
		volume_quote: number | null;
		base_token_id: number;
		quote_token_id: number;
	}>,
	targetTokenIds: number[]
): number {
	return swaps.reduce((total, swap) => {
		let volume = 0;

		// Add volume when token is the base token
		if (targetTokenIds.includes(swap.base_token_id)) {
			volume += swap.volume_base || 0;
		}

		// Add volume when token is the quote token
		if (targetTokenIds.includes(swap.quote_token_id)) {
			volume += swap.volume_quote || 0;
		}

		return total + volume;
	}, 0);
}

function oldTokenVolumeMetrics(rows: SwapRow[], now: string, allIds: number[]) {
	const volume24hData = inWindow(rows, now, 1);
	const volume7dData = inWindow(rows, now, 7);
	const volume30dData = inWindow(rows, now, 30);
	// Aggregate volume for each period
	const volume24h = aggregateVolume(volume24hData || [], allIds);
	const volume7d = aggregateVolume(volume7dData || [], allIds);
	const volume30d = aggregateVolume(volume30dData || [], allIds);

	return {
		volume24h,
		volume7d,
		volume30d
	};
}

function oldTokenTvlMetrics(rows: SwapRow[], allIds: number[]) {
	const data = rows.filter(
		(row) => allIds.includes(row.base_token_id) || allIds.includes(row.quote_token_id)
	);
	if (!data || data.length === 0) {
		return { totalTvl: 0, poolCount: 0 };
	}

	// Group by pool_id and get the latest entry for each pool
	const latestPoolData = new Map();

	data.forEach((row) => {
		const poolId = row.pool_id;
		const ts = new Date(row.ts).getTime();

		if (!latestPoolData.has(poolId) || latestPoolData.get(poolId).ts < ts) {
			latestPoolData.set(poolId, {
				...row,
				ts
			});
		}
	});

	// Calculate TVL for our token across all pools
	let totalTvl = 0;
	let poolCount = 0;

	latestPoolData.forEach((poolData) => {
		// Add balance for our token from this pool
		if (allIds.includes(poolData.base_token_id)) {
			totalTvl += poolData.poolbal_a || 0;
		}
		if (allIds.includes(poolData.quote_token_id)) {
			totalTvl += poolData.poolbal_b || 0;
		}
		poolCount++;
	});

	return {
		totalTvl,
		poolCount
	};
}

function oldLatestByPool(rows: SwapRow[]) {
	const latestByPool = new Map<number, SwapRow>();
	for (const row of sortedRows(rows, false)) {
		if (!latestByPool.has(row.pool_id)) latestByPool.set(row.pool_id, row);
	}
	return latestByPool;
}

function oldPairWindow(swaps: SwapRow[], now: string, baseTokenId: number, quoteTokenId: number) {
	const rows = sortedRows(inWindow(swaps, now, 1), true);
	const pair = { baseTokenId, quoteTokenId };
	let volQuoteSum = 0;
	let firstPrice: number | null = null;
	let lastPrice: number | null = null;
	for (const r of rows) {
		const pq = Number(r.price_quote || 0);
		let orientedPrice = 0; // pair base in pair quote units
		if (r.base_token_id === pair.baseTokenId && r.quote_token_id === pair.quoteTokenId) {
			orientedPrice = pq;
			// quote volume already in pair.quote units
			volQuoteSum += Number(r.volume_quote || 0);
		} else if (
			r.base_token_id === pair.quoteTokenId &&
			r.quote_token_id === pair.baseTokenId &&
			pq > 0
		) {
			orientedPrice = 1 / pq;
			// In this orientation, "quote" is the pair base. Use volume_base which is pair.quote units
			volQuoteSum += Number(r.volume_base || 0);
		}
		if (!firstPrice && orientedPrice > 0) firstPrice = orientedPrice;
		if (orientedPrice > 0) lastPrice = orientedPrice;
	}
	return { volQuoteSum, firstPrice, lastPrice };
}

function assertMetrics(actual: object, expected: object) {
	assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
	for (const key of Object.keys(expected)) {
		const a = (actual as Record<string, unknown>)[key];
		const e = (expected as Record<string, unknown>)[key];
		if (typeof e === 'number' && !['swapCount24h', 'uniqueTraders24h', 'poolCount'].includes(key)) {
			assert.equal(typeof a, 'number', key);
			assert.ok(
				Math.abs((a as number) - e) <= 1e-9 * Math.max(Math.abs(e), Number.MIN_VALUE),
				`${key}: ${a} != ${e}`
			);
		} else {
			assert.equal(a, e, key);
		}
	}
}

for (const poolId of poolIds) {
	const poolRows = rows.filter((row) => row.pool_id === poolId);
	const agg = byPool.get(poolId);
	test(`pool ${poolId}: volume and reserve parity`, () => {
		assertMetrics(poolVolumeMetrics(agg), oldPoolVolumeMetrics(poolRows, now));
		assert.deepEqual(poolLatestReserves(agg), oldPoolReserves(poolRows));
	});
	test(`pool ${poolId}: latest swap parity`, () => {
		const old = oldLatestByPool(poolRows).get(poolId);
		assert.deepEqual(
			latestSwapRow(agg),
			old && {
				pool_id: old.pool_id,
				ts: old.ts,
				base_token_id: old.base_token_id,
				quote_token_id: old.quote_token_id,
				price_quote: old.price_quote,
				poolbal_a: old.poolbal_a,
				poolbal_b: old.poolbal_b
			}
		);
	});
	for (const [base, quote] of [
		[0, 302190],
		[302190, 0]
	]) {
		test(`pool ${poolId}: markets parity ${base}/${quote}`, () => {
			assertMetrics(pairWindow(agg, base, quote), oldPairWindow(poolRows, now, base, quote));
		});
	}
}

for (const ids of [[0], [302190], [0, 302190], [395614]]) {
	test(`token ids ${ids}: volume and TVL parity`, () => {
		assertMetrics(
			tokenVolumeMetrics(aggregates.values(), ids),
			oldTokenVolumeMetrics(rows, now, ids)
		);
		assertMetrics(tokenTvlMetrics(aggregates.values(), ids), oldTokenTvlMetrics(rows, ids));
	});
}

test('missing pool produces zeros, null reserves and no latest swap', () => {
	assertMetrics(poolVolumeMetrics(undefined), oldPoolVolumeMetrics([], now));
	assert.equal(poolLatestReserves(undefined), null);
	assert.equal(latestSwapRow(undefined), undefined);
	assert.deepEqual(pairWindow(undefined, 0, 302190), {
		volQuoteSum: 0,
		firstPrice: null,
		lastPrice: null
	});
});

test('fetchPoolAggregates dedupes 250 ids into parallel chunks of at most 100', async () => {
	const ids = Array.from({ length: 250 }, (_, i) => i);
	const calls: number[][] = [];
	const pending: Array<() => void> = [];
	const client = {
		rpc(fn: string, args: object) {
			assert.equal(fn, 'get_pool_aggregates');
			const chunk = (args as { p_pool_ids: number[] }).p_pool_ids;
			calls.push(chunk);
			return new Promise<{ data: unknown; error: unknown }>((resolve) => {
				pending.push(() =>
					resolve({ data: chunk.map((id) => ({ ...aggregates[2], pool_id: id })), error: null })
				);
			});
		}
	};
	const result = fetchPoolAggregates(client, [...ids, ...ids]);
	assert.deepEqual(
		calls.map((chunk) => chunk.length),
		[100, 100, 50]
	);
	assert.deepEqual(calls.flat(), ids);
	pending.forEach((resolve) => resolve());
	const map = await result;
	assert.deepEqual([...map.keys()], ids);
	for (const id of ids) assert.deepEqual(map.get(id), { ...aggregates[2], pool_id: id });
});

test('fetchPoolAggregates throws on any RPC error', async () => {
	const error = { message: 'RPC failed' };
	let calls = 0;
	await assert.rejects(
		fetchPoolAggregates(
			{
				rpc: async () => ({ data: [], error: ++calls === 2 ? error : null })
			},
			Array.from({ length: 101 }, (_, i) => i)
		),
		(caught: unknown) => caught === error
	);
});

test('fetchPoolAggregates skips RPC for no pool ids', async () => {
	const result = await fetchPoolAggregates({ rpc: async () => assert.fail('unexpected RPC') }, []);
	assert.equal(result.size, 0);
});

test('round zero still represents a swap, and null balances become zero', () => {
	const agg = { ...aggregates[0], latest_round: 0, latest_poolbal_a: null, latest_poolbal_b: null };
	assert.deepEqual(poolLatestReserves(agg), { reserveA: 0, reserveB: 0 });
	assert.ok(latestSwapRow(agg));
	assert.deepEqual(tokenTvlMetrics([agg], [0, 302190]), { totalTvl: 0, poolCount: 1 });
});
