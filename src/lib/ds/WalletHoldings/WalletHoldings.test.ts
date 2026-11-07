import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { compile } from 'svelte/compiler';
import WalletHoldings from './WalletHoldings.svelte';
import { tokens as population } from './fixtures';

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('$lib/services/accounts', () => ({ fetchFungibleTokens: vi.fn() }));
vi.mock('$lib/utils/envoi', () => ({ resolveEnvoiToken: vi.fn() }));
const account = {
	status: 'loaded' as const,
	value: { balance: 0, minBalance: 100000, status: 'Offline', pendingRewards: 0, round: 1 }
};
const token = {
	id: '1',
	name: 'Unknown asset',
	symbol: 'TOK',
	balance: 1,
	decimals: 8,
	value: 0,
	imageUrl: '',
	verified: false,
	type: 'vsa' as const
};
const controller = () =>
	readFileSync(new URL('../../component/PortfolioComponent.svelte', import.meta.url), 'utf8');

it('D4 renders partial nonzero assets as Unavailable and withholds the total and composition bar', () => {
	const html = render(WalletHoldings, {
		props: { pageAddress: 'Y', account, tokens: [token], partial: true, tokenState: 'ready' }
	}).body;
	expect(html).toContain('Unknown asset');
	expect(html).toContain('Unavailable');
	expect(html).toContain('Some pool or approval details are unavailable');
	expect(html).not.toContain('Holdings total');
	expect(html).not.toContain('Holdings composition');
});
it('confirmed native zero is ready, token failure is unavailable, and NFTs do not start or display a count at mount', () => {
	const html = render(WalletHoldings, {
		props: { pageAddress: 'Y', account, tokens: [], tokenState: 'error', tokenError: 'offline' }
	}).body;
	expect(html).toContain('0');
	expect(html).toContain('VOI');
	expect(html).toContain('Token balances unavailable');
	expect(html).toContain('Show collectibles');
	expect(html).not.toContain('0 NFTs');
	expect(html).not.toContain('No liquidity positions');
});
it('expansion only adds rows and permanently removes the page limit', async () => {
	const source = readFileSync(new URL('./WalletHoldings.svelte', import.meta.url), 'utf8');
	const script = source.split('</script>')[0].replace('<script lang="ts">', '');
	const ast = ts.createSourceFile('presenter.ts', script, ts.ScriptTarget.Latest, true);
	const states = ast.statements.filter(
		(node) => ts.isVariableStatement(node) && /\$state\(false\)/.test(node.getText(ast))
	);
	const context = createContext({ $state: (value: boolean) => value });
	runInContext(
		ts.transpileModule(states.map((node) => node.getText(ast)).join('\n'), {}).outputText,
		context
	);
	const limit = source.match(/limit=\{([^}]+)\}/)?.[1];
	expect(limit, 'The page owns the token limit').toBe('tokensExpanded ? undefined : 10');
	expect(runInContext(limit!, context)).toBe(10);
	const handlers = [...source.matchAll(/onclick=\{(\(\) => \([^}]+\))\}/g)].map(
		(match) => match[1]
	);
	const expansions: string[] = [];
	for (const state of ['tokensExpanded', 'showDust']) {
		const expand = handlers.find((handler) => handler.includes(state));
		expect(expand, `An expansion handler sets ${state}`).toBeDefined();
		expansions.push(`(${expand})();`);
		runInContext(`(${expand})()`, context);
		expect(runInContext(state, context)).toBe(true);
		// Repeating any available expansion cannot return either state to false.
		runInContext(`(${expand})()`, context);
		expect(runInContext(state, context)).toBe(true);
	}
	expect(runInContext(limit!, context)).toBeUndefined();
	expect(source).not.toMatch(/Show fewer|Show less|Hide dust|Collapse/);
	expect(source).toContain('{#if !tokensExpanded && display.rows.tokens.length > 10}');
	expect(source).toContain('{#if !showDust}');
	const html = render(WalletHoldings, {
		props: { pageAddress: 'Y', account, tokens: population, tokenState: 'ready' }
	}).body;
	expect(html).toContain('Show 5 more tokens');
	expect(html).not.toMatch(/Show fewer|Show less|Hide dust|Collapse/);
	// Render the actual presenter with the state produced by those same expansion handlers.
	const expandedSource = source.replace(
		'const display =',
		`${expansions.join('\n')}\nconst display =`
	);
	const compiled = compile(expandedSource, {
		generate: 'server',
		filename: 'WalletHoldings.svelte'
	}).js.code;
	const imports = [
		...new Set([...compiled.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1]))
	];
	const modules = new Map(
		await Promise.all(
			imports.map(
				async (id) =>
					[id, await import(id.startsWith('.') ? new URL(id, import.meta.url).href : id)] as const
			)
		)
	);
	const expandedContext = createContext({ exports: {}, require: (id: string) => modules.get(id) });
	runInContext(
		ts.transpileModule(compiled, {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
		}).outputText,
		expandedContext
	);
	const expandedHtml = render(expandedContext.exports.default, {
		props: { pageAddress: 'Y', account, tokens: population, tokenState: 'ready' }
	}).body;
	expect(expandedHtml).toContain('data-token-id="14"');
	expect(expandedHtml).toContain('data-token-id="zero"');
	expect(expandedHtml).not.toMatch(
		/Show \d+ more tokens|Show dust|Show fewer|Show less|Hide dust|Collapse/
	);
});
it('controller delegates presentation using full raw population and the original snippets', () => {
	const source = controller();
	expect(source).toMatch(/<WalletHoldings\b[^]*?tokens=\{fungibleTokens\}/);
	for (const name of ['nativeActions()', 'tokenActions(token: FungibleTokenType)', 'claims()'])
		expect(source).toContain(`{#snippet ${name}}`);
	expect(source).toMatch(/<FungibleToken\s+\{token\}/);
	expect(source).toContain('{fungibleTokens}');
	const original = execFileSync(
		'git',
		['show', '0402a41:src/lib/component/PortfolioComponent.svelte'],
		{ encoding: 'utf8' }
	);
	for (const name of [
		'openSendVoiModal',
		'openBridgeModal',
		'bulkClaimAllTokens',
		'calculateClaimableTokensSummary',
		'handleTokenSent',
		'handleClaimableTokenViewDetails',
		'handleTokenClaimed'
	]) {
		const fn = new RegExp(`\\t(?:async )?function ${name}\\([^]*?\\n\\t\\}`);
		expect(source.match(fn)?.[0], name).toBe(original.match(fn)?.[0]);
	}
	expect(source.slice(source.indexOf('<!-- Send VOI Modal -->'))).toBe(
		original.slice(original.indexOf('<!-- Send VOI Modal -->'))
	);
	const normalized = (text: string) => text.replace(/\s+/g, ' ');
	for (const component of ['FungibleToken', 'ClaimableTokenCard']) {
		const mount = new RegExp(`<${component}\\s+[\\s\\S]*?/>`);
		expect(normalized(source.match(mount)![0])).toBe(normalized(original.match(mount)![0]));
	}
	// Every original function except the two explicitly migrated read delegates stays intact.
	const originalScript = original.split('</script>')[0].replace('<script lang="ts">', '');
	const ast = ts.createSourceFile('baseline.ts', originalScript, ts.ScriptTarget.Latest, true);
	for (const node of ast.statements) {
		if (
			!ts.isFunctionDeclaration(node) ||
			['refreshTokens', 'initializePortfolio'].includes(node.name!.text)
		)
			continue;
		expect(source, node.name!.text).toContain(node.getText(ast));
	}
});
it('native controls retain their exact gates, including Bridge receive for X != Y', () => {
	const source = controller();
	expect(source).toContain("disabled={!canSignTransactions || accountPart.status !== 'loaded'}");
	const bridge = source.match(/<button\s+on:click=\{openBridgeModal\}[^]*?<\/button>/)?.[0];
	expect(bridge).toBeDefined();
	expect(bridge).not.toContain('disabled=');
	expect(source).toContain('on:click={openVoiTransfersModal}');
	const actual = readFileSync(
		new URL('../../component/BridgeModal.svelte', import.meta.url),
		'utf8'
	);
	expect(actual).toContain('captureSigner()');
	expect(actual).toContain('canSignTransactions');
});

it('top ten and dust never narrow the actual Claim All builder population', async () => {
	const source = controller();
	const summary = source.match(/\tfunction calculateClaimableTokensSummary\([^]*?\n\t\}/)![0];
	const bulk = source.match(/\tasync function bulkClaimAllTokens\([^]*?\n\t\}/)![0];
	const built: number[] = [];
	class Contract {
		constructor(id: number) {
			built.push(id);
		}
		async arc200_transferFrom() {
			return { success: false };
		}
	}
	const context = createContext({
		fungibleTokens: population,
		claimableTokensSummary: [],
		walletAddress: 'Y',
		$selectedWallet: { address: 'Y', app: 'fixture' },
		isBulkClaiming: false,
		bulkClaimProgress: 0,
		bulkClaimError: null,
		bulkClaimResults: [],
		captureSigner: () => ({ address: 'Y' }),
		fixtureImport: async () => ({ arc200: Contract }),
		algodClient: {},
		algodIndexer: {},
		Uint8Array,
		BigInt,
		console: { error: vi.fn(), log: vi.fn() },
		refreshPortfolio: vi.fn(),
		refreshTokens: vi.fn()
	});
	runInContext(
		ts.transpileModule(summary + '\n' + bulk.replace("import('ulujs')", "fixtureImport('ulujs')"), {
			compilerOptions: { target: ts.ScriptTarget.ES2022 }
		}).outputText,
		context
	);
	runInContext('claimableTokensSummary = calculateClaimableTokensSummary()', context);
	expect(context.claimableTokensSummary).toHaveLength(15); // fourteen regular tokens and one LP with an approval
	await runInContext('bulkClaimAllTokens()', context);
	expect(built).toHaveLength(15);
	expect(built).toContain(14);
});

it('NFT ownership begins only on expansion, publishes count before metadata, and remembers a collapse', async () => {
	const source = controller();
	const handler = source.match(/\tasync function readWalletNfts\([^]*?\n\t\}/)?.[0];
	expect(handler, 'First expansion must have a wired read handler').toBeDefined();
	expect(source).toContain('onnfts={() => readWalletNfts()}');
	const ownership = Promise.withResolvers<unknown[]>();
	const metadata = Promise.withResolvers<{ tokens: unknown[]; partial: boolean }>();
	const owned = [{ contractId: '797609', tokenId: '7', name: 'NFT #7', imageUrl: '' }];
	const context = createContext({
		walletAddress: 'Y',
		nftAddress: 'Y',
		nftGeneration: 0,
		nfts: undefined,
		nftState: 'idle',
		nftPartial: false,
		nftMetadataLoading: false,
		loadWalletNfts: vi.fn(() => ownership.promise),
		enrichWalletNfts: vi.fn(() => metadata.promise)
	});
	runInContext(
		ts.transpileModule(handler!, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
			.outputText,
		context
	);
	expect(context.loadWalletNfts).not.toHaveBeenCalled();
	const pending = runInContext('readWalletNfts()', context);
	expect(context.nfts).toBeUndefined();
	ownership.resolve(owned);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(context.nfts).toEqual(owned);
	expect(context.nftState).toBe('ready');
	metadata.resolve({ tokens: owned, partial: true });
	await pending;
	expect(context.nfts).toEqual(owned);
	expect(context.nftPartial).toBe(true);
	await runInContext('readWalletNfts()', context);
	expect(context.loadWalletNfts).toHaveBeenCalledTimes(1);
});
