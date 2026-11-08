import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import WalletSearchPage from './WalletSearchPage.svelte';
import SearchBox from '../SearchBox/SearchBox.svelte';
import { createResolver } from '../SearchBox/resolve';
it('SSR always contains the hero, explanation and form without accessing storage', () => {
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
		'wallet-search-hero-input'
	])
		expect(html).toContain(text);
	expect(html).not.toContain('Try');
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
it('Your accounts lists signing entries once per address, taking the signing name', async () => {
	const source = readFileSync(new URL('./WalletSearchPage.svelte', import.meta.url), 'utf8');
	const fn = source.match(/function signingAccounts\([^]*?\n\t\}/)?.[0];
	expect(fn).toBeDefined();
	const { pageAccountState } = await import('$lib/chain/signerGate');
	const entries = [
		{ address: 'Y', app: 'Watch', name: 'Watch name' },
		{ address: 'Y', app: 'pera', name: 'Alice' },
		{ address: 'Y', app: 'defly', name: 'Other name' },
		{ address: 'W', app: 'Watch' },
		{ address: 'X', app: 'defly', name: 'Bob' },
		{ address: 'BLANK', app: '' }
	];
	const result = runInNewContext(
		ts.transpile(`${fn}; signingAccounts(entries)`, { target: ts.ScriptTarget.ES2022 }),
		{ entries, pageAccountState }
	);
	expect(result).toEqual([entries[1], entries[4]]);
	expect(source).toContain('<Card title="Your accounts">');
	expect(source.indexOf('<Card title="Your accounts">')).toBeLessThan(
		source.indexOf('<Card title="Recent wallets">')
	);
});
