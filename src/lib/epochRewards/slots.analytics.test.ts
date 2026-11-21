import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import { render } from 'svelte/server';
import epochs from '$lib/network/fixtures/epochs.json';
import stake from '$lib/network/fixtures/online-stake-history.json';
import prices from '$lib/network/fixtures/price-history-7d.json';
import transactions from '$lib/network/fixtures/tx-counts-day-30.json';
import { createNetwork } from '$lib/network/model';
import { epochAnalytics } from '$lib/epochRewards/client';
import Page from '../../routes/(site)/analytics/+page.svelte';

// The switch-on analytics page, unmocked: the epoch read starts first and the epoch charts
// keep their places among the network ones.
const now = Date.parse('2026-11-06T12:00:00Z');
const source = readFileSync(
	new URL('../../routes/(site)/analytics/+page.svelte', import.meta.url),
	'utf8'
);

test('the epoch read is the first of the page reads', () => {
	const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
		const path = String(url);
		if (path === '/api/epochs') return Response.json(epochs);
		if (path.includes('online-stake-history')) return Response.json(stake);
		if (path === '/api/price-history?period=7d') return Response.json(prices);
		return Response.json(transactions);
	});
	const script = source.split('<script lang="ts">')[1].split('</script>')[0];
	const ast = ts.createSourceFile('page.ts', script, ts.ScriptTarget.Latest, true);
	const wanted = ast.statements.filter(
		(node) =>
			(ts.isVariableStatement(node) &&
				node.declarationList.declarations.some(
					(d) => ts.isIdentifier(d.name) && ['model', 'epochs'].includes(d.name.text)
				)) ||
			(ts.isExpressionStatement(node) && /^onMount\(/.test(node.getText(ast)))
	);
	expect(wanted).toHaveLength(3);
	runInNewContext(wanted.map((node) => ts.transpile(node.getText(ast))).join('\n'), {
		createNetwork: () => createNetwork({ fetch, now: () => now }),
		epochAnalytics: () => epochAnalytics({ fetch, now: () => now }),
		onMount: (start: () => void) => start()
	});
	const urls = fetch.mock.calls.map(([url]) => String(url));
	expect(urls[0]).toBe('/api/epochs');
	expect(urls).toHaveLength(4);
	expect(urls.filter((url) => url === '/api/epochs')).toHaveLength(1);
});

test('the seven charts keep their order', () => {
	const html = render(Page).body.replace(/<!--[\s\S]*?-->/g, '');
	expect([...html.matchAll(/<h2\b[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1])).toEqual([
		'APR by epoch',
		'Online stake',
		'Real-time block rewards by day',
		'Accounts earning by epoch',
		'Current stake split',
		'VOI price',
		'Transaction activity'
	]);
	expect(html).toContain('Follow rewards by epoch, then the stake competing for them.');
	expect(render(Page).head).toContain(
		'content="Voi network rewards, online stake, rewarded accounts, VOI price and transaction activity."'
	);
});
