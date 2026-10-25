import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFungibleTokens } from './fungibleTokens.ts';

const balances = [
	{ name: 'ARC token', symbol: 'ARC', balance: '2000000', decimals: 6, imageUrl: '', usdValue: null, verified: 1, accountId: 'wallet', assetType: 'arc200', contractId: 123 },
	{ name: 'ASA token', symbol: 'ASA', balance: '3000000', decimals: 6, imageUrl: '', usdValue: null, verified: 1, accountId: 'wallet', assetType: 'asa', contractId: 456 }
];

function fakeFetch(approvals: 'ok' | 'reject' | '500' = 'ok', balancesStatus = 200): typeof fetch {
	return async (input) => {
		const url = new URL(String(input));
		if (url.pathname === '/account/assets') {
			return Response.json({ balances, 'next-token': null, 'total-count': 2, 'current-round': 100 }, { status: balancesStatus });
		}
		assert.equal(url.pathname, '/arc200/approvals');
		if (approvals === 'reject') throw new Error('approvals network error');
		return Response.json({ approvals: [] }, { status: approvals === '500' ? 500 : 200 });
	};
}

function assertBalanceTokens(tokens: Awaited<ReturnType<typeof fetchFungibleTokens>>['tokens']) {
	assert.deepEqual(tokens.map((token) => ({ id: token.id, balance: token.balance, type: token.type })), [
		{ id: '123', balance: 2000000, type: 'arc200' },
		{ id: '456', balance: 3000000, type: 'vsa' }
	]);
}

test('pool failure preserves balance tokens and reports partial enrichment', async () => {
	const result = await fetchFungibleTokens('wallet', 0.0002, {
		getLiquidityPools: async () => { throw new Error('pools unavailable'); }, fetch: fakeFetch()
	});
	assertBalanceTokens(result.tokens);
	assert.equal(result.partial, true);
});

test('both approvals network failures preserve balance tokens and report partial enrichment', async () => {
	const result = await fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools: async () => [], fetch: fakeFetch('reject') });
	assertBalanceTokens(result.tokens);
	assert.equal(result.partial, true);
});

test('non-ok approvals preserve balance tokens and report partial enrichment', async () => {
	const result = await fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools: async () => [], fetch: fakeFetch('500') });
	assertBalanceTokens(result.tokens);
	assert.equal(result.partial, true);
});

test('a balances 500 rejects instead of returning an empty list', async () => {
	await assert.rejects(fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools: async () => [], fetch: fakeFetch('ok', 500) }), /Failed to fetch token balances/);
});

test('successful sources return balance tokens without partial enrichment', async () => {
	const result = await fetchFungibleTokens('wallet', 0.0002, { getLiquidityPools: async () => [], fetch: fakeFetch() });
	assertBalanceTokens(result.tokens);
	assert.equal(result.partial, false);
});
