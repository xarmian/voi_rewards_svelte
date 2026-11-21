import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import { render } from 'svelte/server';
import stake from '$lib/network/fixtures/online-stake-history.json';
import prices from '$lib/network/fixtures/price-history-7d.json';
import transactions from '$lib/network/fixtures/tx-counts-day-30.json';

// The switch-off analytics page: the network charts only, and no epoch read.
vi.mock('$lib/epochRewards/config', () => ({ EPOCH_REWARDS_ENABLED: false }));
vi.mock('$lib/network/model', async (original) => {
	const actual = await original<typeof import('$lib/network/model')>();
	return { ...actual, createNetwork: vi.fn(actual.createNetwork) };
});
vi.mock('$lib/wallet/read', async (original) => {
	const actual = await original<typeof import('$lib/wallet/read')>();
	const day = (date: string) => ({
		day: date,
		blocks: 30_000,
		rewardedBlocks: 1_234,
		amount: 2_500_000_000,
		feesCollected: 0,
		lastRound: null
	});
	return {
		...actual,
		// The daily block rewards card is ready, so every chart shows its data table.
		createReadSource: <T>(_: unknown, publish: (result: { state: 'ready'; value: T }) => void) => {
			publish({ state: 'ready', value: [day('2026-11-05'), day('2026-11-06')] as T });
			return { load: async () => {}, dispose: () => {} };
		}
	};
});
import { createNetwork } from '$lib/network/model';
import { epochAnalytics } from '$lib/epochRewards/client';
import Page from '../../routes/(site)/analytics/+page.svelte';

const now = Date.parse('2026-11-06T12:00:00Z');
const fetcher = () =>
	vi.fn<typeof fetch>(async (url) => {
		const path = String(url);
		if (path.includes('online-stake-history')) return Response.json(stake);
		if (path === '/api/price-history?period=7d') return Response.json(prices);
		if (path.startsWith('/api/mimir?action=get_tx_counts')) return Response.json(transactions);
		throw new Error(`Unexpected request ${path}`);
	});

test('the page starts the three network reads and no epoch read', () => {
	expect(epochAnalytics()).toBeNull();
	const fetch = fetcher();
	const source = readFileSync(
		new URL('../../routes/(site)/analytics/+page.svelte', import.meta.url),
		'utf8'
	);
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
	expect(urls).toHaveLength(3);
	expect(urls.some((url) => url.includes('/api/epochs'))).toBe(false);
});

test('the page shows the four network charts and no epoch figure', async () => {
	const fetch = fetcher();
	const model = createNetwork({ fetch, now: () => now });
	await model.load();
	expect(fetch).toHaveBeenCalledTimes(3);
	expect(fetch.mock.calls.map(([url]) => String(url))).not.toContain('/api/epochs');
	vi.mocked(createNetwork).mockReturnValueOnce(model);
	const page = render(Page);
	const html = page.body.replace(/<!--[\s\S]*?-->/g, '');
	const titles = [...html.matchAll(/<h2\b[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
	expect(titles).toEqual([
		'Online stake',
		'Real-time block rewards by day',
		'VOI price',
		'Transaction activity'
	]);
	expect(html.match(/>View data<\/summary>/g)).toHaveLength(4);
	const shown = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
	expect(shown).not.toMatch(/\bAPR\b/);
	expect(shown).not.toMatch(/stake split/i);
	expect(shown).not.toContain('Follow rewards by epoch');
	// The daily block rewards caption says epoch rewards are not in its figures; nothing else names one.
	const caption = 'Epoch rewards are separate and not included.';
	expect(shown).toContain(caption);
	expect(shown.replaceAll(caption, '')).not.toMatch(/epoch/i);
	expect(page.head).toContain(
		'content="Voi online stake, real-time block rewards, VOI price and transaction activity."'
	);
});
