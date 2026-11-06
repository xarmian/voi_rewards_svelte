import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import { parse } from 'svelte/compiler';
import { resolveHash, WALLET_TABS } from '$lib/ds/Tabs/hash';
const url = vi.hoisted(() => ({ hash: '' }));
vi.mock('$lib/chain/wallet.svelte', async () => {
	const { writable } = await import('svelte/store');
	return { selectedWallet: writable(null), connectedWallets: writable([]), selectWallet: vi.fn() };
});
vi.mock('$lib/utils/algod', () => ({ algodClient: {}, algodIndexer: {} }));
vi.mock('$lib/wallet/load', () => ({ loadWallet: vi.fn() }));
vi.mock('avm-wallet-svelte', () => ({ Web3Wallet: () => {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/ds/Tabs/hashTabs.svelte', () => ({
	createHashTabs: () => ({ current: resolveHash(url.hash, WALLET_TABS).id, hash: url.hash })
}));
vi.mock('$lib/component/NodeComponent.svelte', async () => {
	const { default: Panel } = await import('./LegacyPanel.test.svelte');
	return { default: (anchor: never) => Panel(anchor, { label: 'Legacy consensus content' }) };
});
vi.mock('$lib/component/ProposalsComponent.svelte', async () => {
	const { default: Panel } = await import('./LegacyPanel.test.svelte');
	return { default: (anchor: never) => Panel(anchor, { label: 'Legacy proposals content' }) };
});
vi.mock('$lib/component/EpochComponent.svelte', async () => {
	const { default: Panel } = await import('./LegacyPanel.test.svelte');
	return { default: (anchor: never) => Panel(anchor, { label: 'Legacy epochs content' }) };
});
vi.mock('$lib/component/LockVestComponent.svelte', async () => {
	const { default: Panel } = await import('./LegacyPanel.test.svelte');
	return { default: (anchor: never) => Panel(anchor, { label: 'Legacy lockvest content' }) };
});
vi.mock('$lib/component/PortfolioComponent.svelte', async () => {
	const { default: Panel } = await import('./LegacyPanel.test.svelte');
	return { default: (anchor: never) => Panel(anchor, { label: 'Legacy portfolio content' }) };
});
vi.mock('$lib/component/CalculatorComponent.svelte', async () => {
	const { default: Panel } = await import('./LegacyPanel.test.svelte');
	return { default: (anchor: never) => Panel(anchor, { label: 'Legacy calculator content' }) };
});
import Page from './[...id]/+page.svelte';
it('keeps the single Web3Wallet outside KeyBlock, IfBlock and EachBlock ancestors', () => {
	const source = readFileSync('src/routes/(site)/wallet/[...id]/+page.svelte', 'utf8');
	const ast = parse(source, { modern: true });
	const pickerAncestors: string[][] = [];
	function visit(value: unknown, ancestors: string[] = []) {
		if (!value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			value.forEach((child) => visit(child, ancestors));
			return;
		}
		const node = value as { type?: string; name?: string };
		if (node.type === 'Component' && node.name === 'Web3Wallet') {
			pickerAncestors.push(ancestors);
		}
		const next = node.type ? [...ancestors, node.type] : ancestors;
		Object.values(value).forEach((child) => visit(child, next));
	}
	visit(ast.fragment);
	expect(pickerAncestors).toHaveLength(1);
	expect(
		pickerAncestors[0].filter((type) => ['KeyBlock', 'IfBlock', 'EachBlock'].includes(type))
	).toEqual([]);
});
describe('wallet shell hash integration', () => {
	it.each([
		['#portfolio', 'holdings', 'portfolio'],
		['#consensus', 'overview', 'consensus'],
		['#proposals', 'rewards', 'proposals'],
		['#epochs', 'rewards', 'epochs'],
		['#lockvest', 'contracts', 'lockvest'],
		['#calculator', 'calculator', 'calculator']
	])('%s renders the %s panel and legacy %s content', (hash, expected, content) => {
		url.hash = hash;
		const html = render(Page, {
			props: { data: { walletId: 'OWNER', parentWalletId: null } }
		}).body;
		expect(html).toContain(`Legacy ${content} content`);
		expect(html).toMatch(new RegExp(`href="#${expected}"[^>]*aria-current="page"`));
		if (hash === '#consensus') expect(html).toMatch(/<details[^>]* open/);
	});
});
