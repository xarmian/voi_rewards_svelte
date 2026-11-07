import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import WalletSearchPage from './WalletSearchPage.svelte';
import SearchBox from '../SearchBox/SearchBox.svelte';
import { createResolver } from '../SearchBox/resolve';
it('SSR always contains the hero, explanation, form and examples without accessing storage', () => {
	const resolver = {
		...createResolver(),
		recents: vi.fn(() => {
			throw new Error('storage');
		})
	};
	const html = render(WalletSearchPage, { props: { onsubmit: vi.fn(), resolver } }).body;
	for (const text of [
		'Check a wallet',
		'Rewards, contracts and holdings for any address.',
		'Recent wallets',
		'/wallet/shelly.of.voi',
		'/wallet/xarmian.voi',
		'wallet-search-hero-input'
	])
		expect(html).toContain(text);
	expect(resolver.recents).not.toHaveBeenCalled();
	const header = render(SearchBox, {
		props: { variant: 'compact', id: 'ds-search-header', onsubmit: vi.fn() }
	}).body;
	const ids = [...(header + html).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
	expect(new Set(ids).size).toBe(ids.length);
});
it('missing or inaccessible storage leaves usable search and an explicit recents empty state', () => {
	const source = readFileSync(new URL('./WalletSearchPage.svelte', import.meta.url), 'utf8');
	const ast = ts.createSourceFile(
		'component.ts',
		source.split('<script lang="ts">')[1].split('</script>')[0],
		ts.ScriptTarget.Latest,
		true
	);
	const fn = ast.statements.find(
		(n) => ts.isFunctionDeclaration(n) && n.name?.text === 'loadRecents'
	)!;
	expect(fn).toBeDefined();
	for (const resolver of [
		{ recents: () => [] },
		{
			recents: () => {
				throw new Error('storage');
			}
		}
	]) {
		const context = { resolver, recent: ['old'], recentReady: false };
		runInNewContext(`${ts.transpile(fn.getText(ast))}; loadRecents()`, context);
		expect(context.recent).toEqual([]);
		expect(context.recentReady).toBe(true);
	}
	expect(source).toContain('No recent wallets yet. Search an address or try an example.');
});
