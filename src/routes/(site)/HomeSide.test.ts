import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { render } from 'svelte/server';
import LatestBlocks from './LatestBlocks.svelte';
import RunNodeCard from './RunNodeCard.svelte';
import MarketsCard from './MarketsCard.svelte';
import { topMarkets, marketsSummary } from '$lib/home/markets';
import { usd } from '$lib/ds/format';
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));
const response = {
	marketData: [
		{
			exchange: 'Uniswap',
			pair: 'aVOI/USDC',
			network: 'Base',
			price: 0.000129,
			tvl: 7765.284661631193,
			trading_pair_id: 'uni'
		},
		{
			exchange: 'Tinyman',
			pair: 'aVOI/USDC',
			network: 'Algorand',
			price: 0.000126,
			tvl: 3726.992326293455,
			trading_pair_id: 'tiny'
		},
		{
			exchange: 'Humble',
			pair: 'VOI/aUSDC',
			network: 'Voi',
			price: 0.000131,
			tvl: 1882.39769,
			trading_pair_id: 'humble'
		},
		{
			exchange: 'PactFi',
			pair: 'aVOI/USDC',
			network: 'Algorand',
			price: 0.000127,
			tvl: 1337.89978191,
			trading_pair_id: 'pact'
		}
	],
	aggregates: { totalVolume: 63.60061609301293, totalTvl: 14719.097435834648 }
};
test('LatestBlocks stays a five-row loading skeleton on the server', () => {
	const body = render(LatestBlocks).body;
	assert.match(body, /aria-busy="true"/);
	assert.equal((body.match(/<li\b/g) ?? []).length, 5);
	assert.doesNotMatch(body, /<ul[^>]*aria-live/);
});
test('Run a node has the three specified links', () => {
	const body = render(RunNodeCard).body;
	for (const href of ['/how_to_node', '/calculator', '/faq'])
		assert.ok(body.includes(`href="${href}"`));
	for (const label of ['Setup guides', 'Rewards calculator', 'FAQ'])
		assert.ok(body.includes(label));
});
test('settled markets render four pools in TVL order, footer, and All markets link', () => {
	// Svelte 5.19 synchronous SSR takes the then branch for a settled value, not a Promise.
	const body = render(MarketsCard, {
		props: {
			markets: {
				state: 'ready',
				value: {
					rows: topMarkets(response),
					...marketsSummary(response),
					asOf: '2026-10-25T02:38:45Z'
				}
			}
		}
	}).body.replace(/<!--[\s\S]*?-->/g, '');
	const tbody = body.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)![1];
	assert.equal((tbody.match(/<tr\b/g) ?? []).length, 4);
	assert.ok(body.indexOf('Uniswap') < body.indexOf('Tinyman'));
	assert.ok(body.indexOf('Tinyman') < body.indexOf('Humble'));
	assert.ok(body.indexOf('Humble') < body.indexOf('PactFi'));
	assert.ok(
		body.includes(
			`24h volume ${usd(response.aggregates.totalVolume)} · total liquidity ${usd(response.aggregates.totalTvl)}`
		)
	);
	assert.match(body, /href="\/markets"/);
	assert.match(body, /<caption[^>]*>Largest VOI markets by TVL<\/caption>/);
});
test('pending markets never show zero and failed markets offer Retry', () => {
	const pending = render(MarketsCard, { props: { markets: new Promise<never>(() => {}) } }).body;
	assert.match(pending, /aria-busy="true"/);
	assert.doesNotMatch(pending, /\$0/);
	const error = render(MarketsCard, {
		props: { markets: { state: 'error', message: 'Failed' } }
	}).body;
	assert.match(error, /role="alert"/);
	assert.match(error.replace(/<!--[\s\S]*?-->/g, ''), />Retry<\/button>/);
});
