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

it('wires route sync exactly once to the page wallet and parent getters without direct selection writes', () => {
	const source = readFileSync('src/routes/(site)/wallet/[...id]/+page.svelte', 'utf8');
	const ast = parse(source, { modern: true });
	const calls: import('estree').CallExpression[] = [];
	function visit(value: unknown) {
		if (!value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			value.forEach(visit);
			return;
		}
		const node = value as { type?: string };
		if (node.type === 'CallExpression') calls.push(value as import('estree').CallExpression);
		Object.values(value).forEach(visit);
	}
	visit(ast);
	const routeCalls = calls.filter(
		(call) => call.callee.type === 'Identifier' && call.callee.name === 'createWalletRouteSync'
	);
	expect(routeCalls).toHaveLength(1);
	for (const [index, name] of ['walletId', 'parentWalletId'].entries()) {
		expect(routeCalls[0].arguments[index]).toMatchObject({
			type: 'ArrowFunctionExpression',
			params: [],
			body: { type: 'Identifier', name }
		});
	}
	// The third argument is the loader: a no-op here would stop client navigation from loading data.
	expect(routeCalls[0].arguments[2]).toMatchObject({
		type: 'Identifier',
		name: 'updateAccountInfo'
	});
	expect(source).not.toMatch(/\bselectWallet\s*\(/);
	expect(source).not.toMatch(/\bselectedWallet\s*\.\s*set\s*\(/);
});

it('binds the legacy Node panel disclosure to showNode', () => {
	const source = readFileSync('src/routes/(site)/wallet/[...id]/+page.svelte', 'utf8');
	const ast = parse(source, { modern: true });
	let found = false;
	function visit(value: unknown, insidePanel = false) {
		if (!value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			value.forEach((child) => visit(child, insidePanel));
			return;
		}
		const node = value as {
			type?: string;
			name?: string;
			attributes?: { type: string; name: string; expression?: { type: string; name?: string } }[];
		};
		const bound =
			insidePanel ||
			(node.type === 'RegularElement' &&
				node.name === 'details' &&
				!!node.attributes?.some(
					(attr) =>
						attr.type === 'BindDirective' &&
						attr.name === 'open' &&
						attr.expression?.type === 'Identifier' &&
						attr.expression.name === 'showNode'
				));
		if (node.type === 'Component' && node.name === 'NodeComponent' && bound) found = true;
		Object.values(value).forEach((child) => visit(child, bound));
	}
	visit(ast.fragment);
	expect(found).toBe(true);
});

it('gives the hero identity a minimum width so the picker wraps instead of crushing the name at 320 px', () => {
	const source = readFileSync('src/routes/(site)/wallet/[...id]/+page.svelte', 'utf8');
	// Without a flex basis the identity group collapses to a sliver beside the picker and the
	// address wraps letter by letter (seen in the production build at 320 px).
	expect(source).toMatch(/class="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-4"/);
	expect(source).toMatch(/class="min-w-0 flex-1 basis-40">\s*<h1/);
});

it('wires wallet identity once to walletId and renders its avatar and name with the address fallback', () => {
	const source = readFileSync('src/routes/(site)/wallet/[...id]/+page.svelte', 'utf8');
	const ast = parse(source, { modern: true });
	const calls: import('estree').CallExpression[] = [];
	const components: import('svelte/compiler').AST.Component[] = [];
	function visit(value: unknown) {
		if (!value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			value.forEach(visit);
			return;
		}
		const node = value as { type?: string };
		if (node.type === 'CallExpression') calls.push(value as import('estree').CallExpression);
		if (node.type === 'Component')
			components.push(value as import('svelte/compiler').AST.Component);
		Object.values(value).forEach(visit);
	}
	visit(ast);
	const identityCalls = calls.filter(
		(call) => call.callee.type === 'Identifier' && call.callee.name === 'createWalletIdentity'
	);
	expect(identityCalls).toHaveLength(1);
	expect(identityCalls[0].arguments).toMatchObject([
		{ type: 'ArrowFunctionExpression', params: [], body: { type: 'Identifier', name: 'walletId' } }
	]);
	const avatars = components.filter((node) => node.name === 'WalletAvatar');
	expect(avatars).toHaveLength(1);
	expect(source.slice(avatars[0].start, avatars[0].end)).toContain('src={identity.avatar}');
	expect(source.slice(avatars[0].start, avatars[0].end)).toContain('gradient={avatar}');
	expect(source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]).toMatch(
		/walletId\s*\?\s*\(?identity.name\s*\?\?\s*shortAddr\(walletId\)\)?\s*:\s*'Check a wallet'/
	);
});
