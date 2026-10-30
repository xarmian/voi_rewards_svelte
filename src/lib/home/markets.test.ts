import assert from 'node:assert/strict';
import { test } from 'vitest';
import { marketsSummary, topMarkets } from './markets';

const rows = [
	{
		exchange: 'Uniswap',
		pair: 'aVOI/USDC',
		network: 'Base',
		price: 0.000129,
		tvl: 7765,
		trading_pair_id: 'uni'
	},
	{
		exchange: 'Tinyman',
		pair: 'aVOI/USDC',
		network: 'Algorand',
		price: 0.000126,
		tvl: 3727,
		trading_pair_id: 'tiny'
	},
	{
		exchange: 'Humble',
		pair: 'VOI/aUSDC',
		network: 'Voi',
		price: 0.000131,
		tvl: 1882,
		trading_pair_id: 'humble'
	},
	{
		exchange: 'PactFi',
		pair: 'aVOI/USDC',
		network: 'Algorand',
		price: 0.000127,
		tvl: 1338,
		trading_pair_id: 'pact'
	}
];
test('top markets follow snapshot TVL order, with unique pool ids and valid prices/TVL', () => {
	const marketData = [...rows].reverse().concat(rows[0]);
	marketData.push({ ...rows[0], trading_pair_id: 'zero', price: 0, tvl: 99999 });
	const result = topMarkets({
		marketData: [
			...marketData,
			{ ...rows[0], tvl: null },
			{ ...rows[0], price: -1 },
			{ ...rows[0], tvl: Infinity }
		]
	});
	assert.deepEqual(
		result.map((row) => row.exchange),
		['Uniswap', 'Tinyman', 'Humble', 'PactFi']
	);
	assert.equal(topMarkets({ marketData }, 2).length, 2);
});
test('empty pools never become zero volume or liquidity', () => {
	const response = { marketData: [], aggregates: { totalVolume: 0, totalTvl: 0 } };
	assert.deepEqual(topMarkets(response), []);
	assert.deepEqual(marketsSummary(response), { volume24h: null, liquidity: null });
});
test('summary uses positive finite aggregates only', () => {
	assert.deepEqual(
		marketsSummary({
			marketData: rows,
			aggregates: { totalVolume: 63.600616, totalTvl: 14719.0974 }
		}),
		{ volume24h: 63.600616, liquidity: 14719.0974 }
	);
	for (const value of [null, 0, -1, NaN, Infinity]) {
		assert.deepEqual(
			marketsSummary({ marketData: rows, aggregates: { totalVolume: value, totalTvl: value } }),
			{ volume24h: null, liquidity: null }
		);
	}
});

test('the table hides dust pools under the TVL floor; the summary totals still count them (TASK-89)', () => {
	const dust = (id: string, tvl: number) => ({
		...rows[2],
		pair: `wVOI/${id}`,
		tvl,
		trading_pair_id: id
	});
	// Measured 10-30: pool TVLs run 117, 91 then 22, 21, 14...; the floor sits in that gap.
	const marketData = [dust('node', 91), dust('flch', 50), dust('iat', 49.99), dust('abtc', 22)];
	assert.deepEqual(
		topMarkets({ marketData }, 10).map((row) => row.trading_pair_id),
		['node', 'flch']
	);
	assert.deepEqual(
		marketsSummary({ marketData, aggregates: { totalVolume: 1, totalTvl: 212.99 } }),
		{
			volume24h: 1,
			liquidity: 212.99
		}
	);
});
