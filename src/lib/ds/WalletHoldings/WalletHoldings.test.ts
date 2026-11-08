import { pageAccountState } from '$lib/chain/signerGate';
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

it('partial nonzero asset value cells read Unavailable and withhold the total and composition bar', () => {
	const html = render(WalletHoldings, {
		props: { pageAddress: 'Y', account, tokens: [token], partial: true, tokenState: 'ready' }
	}).body;
	const row = html.match(/<tr[^>]*>[^]*?Unknown asset[^]*?<\/tr>/)?.[0];
	expect(row).toBeDefined();
	const cells = [...row!.matchAll(/<td\b[^>]*>([^]*?)<\/td>/g)];
	const valueCell = cells[2][1].replace(/<[^>]*>/g, '').trim();
	expect(valueCell).toBe('Unavailable');
	expect(valueCell).not.toMatch(/^0(?:\.0+)?(?: VOI)?$/);
	expect(html).toContain('Some pool or approval details are unavailable');
	expect(html).not.toContain('Holdings total');
	expect(html).not.toContain('Holdings composition');
});
it('confirmed native zero is ready, token failure is unavailable, and NFTs do not start or display a count at mount', () => {
	const html = render(WalletHoldings, {
		props: {
			pageAddress: 'Y',
			account,
			tokens: [],
			tokenState: 'error',
			tokenError: 'offline',
			split: {
				pageAddress: 'Y',
				owner: { address: 'Y', balance: 0 },
				contracts: [],
				contractSet: 'ready'
			}
		}
	}).body;
	expect(html).toMatch(/Page VOI balance<[^]*?>0<[^]*?VOI/);
	expect(html).toMatch(/Liquid[^]*?<dd[^>]*>[^]*?0 VOI[^]*?<\/dd>/);
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
	const context = createContext({ $state: (value: boolean) => value, tokenRows: Array(10) });
	runInContext(
		ts.transpileModule(states.map((node) => node.getText(ast)).join('\n'), {}).outputText,
		context
	);
	const limit = source.match(/limit=\{([^}]+)\}/)?.[1];
	expect(limit, 'The page owns the token limit').toBe(
		'tokensExpanded ? undefined : Math.max(10, tokenRows.length)'
	);
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
	expect(source).toContain(
		'{#if !tokensExpanded && display.rows.tokens.length > tokenRows.length}'
	);
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
it('controller retains the full claim population and transaction-building body', () => {
	const source = controller();
	expect(source).toMatch(/<WalletHoldings\b[^]*?tokens=\{fungibleTokens\}/);
	const original = execFileSync(
		'git',
		['show', '67c1383:src/lib/component/PortfolioComponent.svelte'],
		{ encoding: 'utf8' }
	);
	const body = (text: string) => text.match(/async function bulkClaimAllTokens\([^]*?\n\t\}/)![0];
	const marker = 'const claimAccount = signer.address;';
	expect(body(source).slice(body(source).indexOf(marker))).toBe(
		body(original).slice(body(original).indexOf(marker))
	);
});
it('native signing controls require page membership while history remains visible', () => {
	const source = controller();
	expect(source).toContain("pageAccountState(walletAddress, $connectedWallets).state === 'yours'");
	expect(source).toContain('on:click={openVoiTransfersModal}');
	expect(source).not.toContain('Connect wallet to');
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
		pageAccountState,
		$connectedWallets: [{ address: 'Y', app: 'fixture' }],
		signerMatchesAccount: (signer: { address: string }, page: string) => signer.address === page,
		wrongSignerMessage: () => 'Nothing was signed.',
		capturePageSigner: () => ({ address: 'Y' }),
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
	expect(
		new Set(context.claimableTokensSummary.map((item: { token: { id: string } }) => item.token.id))
			.size
	).toBe(context.claimableTokensSummary.length);
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

it.each([
	[700, 6, '0.0007'],
	[7, 7, '0.0000007'],
	[Number.MAX_SAFE_INTEGER, 6, '9007199254.740991']
])('exact quantity preserves %s base units with %s decimals', (balance, decimals, expected) => {
	const html = render(WalletHoldings, {
		props: {
			pageAddress: 'Y',
			account,
			tokens: [{ ...token, balance, decimals }],
			tokenState: 'ready'
		}
	}).body;
	const exact = html
		.match(/Exact quantity<\/dt>\s*<dd>([^]*?)<\/dd>/)?.[1]
		.replace(/<[^>]*>/g, '')
		.trim();
	expect(exact).toBe(`${expected} TOK`);
});

it('composition exposes a named image and readable amounts', () => {
	const html = render(WalletHoldings, {
		props: {
			pageAddress: 'Y',
			account,
			tokens: [],
			tokenState: 'ready',
			split: {
				pageAddress: 'Y',
				owner: { address: 'Y', balance: 0 },
				contracts: [],
				contractSet: 'ready'
			}
		}
	}).body;
	const bar = html.match(/<div[^>]*aria-label="Holdings composition"[^>]*>/)?.[0];
	expect(bar).toContain('role="img"');
	for (const label of ['Locked', 'LP', 'Tokens and other', 'Liquid']) {
		expect(html).toContain(label);
	}
	expect(html).toMatch(/<dd[^>]*>[^]*?0 VOI[^]*?<\/dd>/);
});

it.each(['refreshTokens', 'initializePortfolio'])(
	'%s ignores a token read after leaving and returning to its address',
	async (name) => {
		const source = controller();
		const reset = source.match(/\$:\s*if \(walletAddress !== sourceAddress\) \{[^]*?\n\t\}/)![0];
		const handler = source.match(new RegExp(`\\tasync function ${name}\\([^]*?\\n\\t\\}`))![0];
		const read = Promise.withResolvers<{ tokens: (typeof token)[]; partial: boolean }>();
		const current = [{ ...token, id: 'current' }];
		const context = createContext({
			walletAddress: 'A',
			sourceAddress: 'A',
			tokenLoadGeneration: 0,
			nftGeneration: 0,
			fungibleTokens: current,
			tokensAsOf: undefined,
			tokensError: null,
			tokensPartial: false,
			isLoadingTokens: false,
			isLoadingLPTokens: false,
			isLoadingPortfolio: false,
			lastTokenPrice: 0,
			tokensPrice: 0,
			$voiPrice: { price: 1 },
			holdingsTokenLoader: vi.fn(() => read.promise),
			fetchAccountDetails: vi.fn(async () => {}),
			fetchVoiPrice: vi.fn(async () => {}),
			recomputeTotals: vi.fn(),
			console: { error: vi.fn() }
		});
		const run = (code: string) =>
			runInContext(
				ts.transpileModule(code, {
					compilerOptions: { target: ts.ScriptTarget.ES2022 }
				}).outputText,
				context
			);
		run(handler);
		const pending = run(`${name}()`);
		await vi.waitFor(() => expect(context.holdingsTokenLoader).toHaveBeenCalled());
		expect(context.holdingsTokenLoader).toHaveBeenCalledExactlyOnceWith('A', 1);
		for (const address of ['B', 'A']) {
			context.walletAddress = address;
			run(reset);
		}
		read.resolve({ tokens: [{ ...token, id: 'obsolete' }], partial: false });
		await pending;
		expect(context.fungibleTokens).toBe(current);
		expect(context.tokensAsOf).toBeUndefined();
	}
);

it('small positive detail values preserve the table amount', () => {
	const html = render(WalletHoldings, {
		props: {
			pageAddress: 'Y',
			account,
			tokens: [{ ...token, value: 0.004, approvals: population[0].approvals }],
			tokenState: 'ready'
		}
	}).body;
	const detail = html
		.match(/data-token-id="1"[^]*?VOI equivalent<\/dt>[^]*?<dd>([^]*?)<\/dd>/)?.[1]
		?.replace(/<[^>]*>/g, '')
		.trim();
	expect(detail).toBe('&lt;0.01 VOI');
});
it('unsafe raw balances display an approximate quantity', () => {
	const html = render(WalletHoldings, {
		props: {
			pageAddress: 'Y',
			account,
			tokens: [{ ...token, balance: 10 ** 18, decimals: 6 }],
			tokenState: 'ready'
		}
	}).body;
	expect(html).toMatch(/Approximate quantity<\/dt>\s*<dd>[^]*?≈ 1000000000000 TOK/);
	expect(html).not.toContain('Exact quantity');
});
it('an unavailable page balance has no currency unit', () => {
	const html = render(WalletHoldings, {
		props: {
			pageAddress: 'Y',
			account: { status: 'unavailable', error: 'offline' },
			tokens: [],
			tokenState: 'ready'
		}
	}).body;
	const tile = html.match(/Page VOI balance[^]*?<\/p>/)?.[0];
	expect(tile).toContain('Unavailable');
	expect(tile?.slice(tile.indexOf('Unavailable'))).not.toContain('VOI');
});
it('NFT retry keeps ready ownership until failure and enrichment errors only mark metadata partial', async () => {
	const handler = controller().match(/\tasync function readWalletNfts\([^]*?\n\t\}/)![0];
	const owned = [{ contractId: '1', tokenId: '2' }];
	const read = Promise.withResolvers<unknown[]>();
	const context = createContext({
		walletAddress: 'Y',
		nftGeneration: 0,
		nfts: owned,
		nftState: 'ready',
		nftPartial: false,
		nftMetadataLoading: false,
		loadWalletNfts: vi.fn(() => read.promise),
		enrichWalletNfts: vi.fn().mockRejectedValue(new Error('metadata offline'))
	});
	runInContext(
		ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
		context
	);
	const pending = runInContext('readWalletNfts(true)', context);
	expect(context.nftState).toBe('ready');
	read.resolve(owned);
	await pending;
	expect(context.nfts).toBe(owned);
	expect(context.nftState).toBe('ready');
	expect(context.nftPartial).toBe(true);
	expect(context.nftMetadataLoading).toBe(false);
	context.loadWalletNfts = vi.fn().mockRejectedValue(new Error('ownership offline'));
	await runInContext('readWalletNfts(true)', context);
	expect(context.nftState).toBe('stale');
});

it('a split retains its loaded address when the route changes', () => {
	const source = readFileSync(
		new URL('../../../routes/(site)/wallet/[...id]/+page.svelte', import.meta.url),
		'utf8'
	);
	const expression =
		source.match(/holdingsSplit=\{(snapshot[^]*?): undefined\}/)![1] + ': undefined';
	const split = runInContext(
		expression,
		createContext({
			walletId: 'B',
			loadedAddress: 'A',
			loadedOwner: 'A',
			ownerLookup: 'ok',
			knownContractSet: 'ready',
			snapshot: { contractSet: 'ready' },
			viewOwner: { address: 'A', balance: 4 },
			viewContracts: []
		})
	);
	const html = render(WalletHoldings, {
		props: { pageAddress: 'B', account, tokens: [], tokenState: 'ready', split }
	}).body;
	for (const label of ['Locked', 'Liquid'])
		expect(html.match(new RegExp(label + '[^]*?<dd[^>]*>([^]*?)</dd>'))?.[1]).toContain(
			'Unavailable'
		);
});

it('unknown ownership displays unavailable native parts and total', () => {
	const html = render(WalletHoldings, {
		props: {
			pageAddress: 'C',
			account: {
				status: 'loaded',
				value: { balance: 12e6, minBalance: 100000, status: 'Offline', round: 1, pendingRewards: 0 }
			},
			tokens: [],
			tokenState: 'ready',
			split: {
				pageAddress: 'C',
				owner: { address: 'C', balance: 12 },
				contracts: [],
				contractSet: 'ready',
				ownerLookup: 'unavailable'
			}
		}
	}).body;
	const text = html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ');
	expect(text).toMatch(/Locked Unavailable/);
	expect(text).toMatch(/Liquid Unavailable/);
	expect(html).toMatch(/aria-label="Holdings total"[^>]*>\s*Unavailable/);
});
it('an unpriced token shows a labelled known subtotal and LP stays known in the split', () => {
	const lp = {
		...token,
		id: 'lp',
		name: 'LP',
		symbol: 'LP',
		value: 5,
		poolInfo: { provider: 'humble' }
	};
	const priced = { ...token, id: 'a', name: 'Priced', value: 7 };
	const html = render(WalletHoldings, {
		props: {
			pageAddress: 'Y',
			account,
			tokens: [lp, priced, token],
			tokenState: 'ready',
			split: {
				pageAddress: 'Y',
				owner: { address: 'Y', balance: 0 },
				contracts: [],
				contractSet: 'ready'
			}
		}
	}).body;
	const split = html.slice(html.indexOf('<dl'), html.indexOf('</dl>'));
	const text = split.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
	expect(text).toMatch(/LP\s*5 VOI/);
	expect(text).toMatch(/Tokens and other\s*7 VOI/);
	expect(text).toContain('Known subtotal; 1 token has no price');
	expect(html).not.toContain('Holdings total');
});
it('an unknown quantity reads Unavailable without a token symbol', () => {
	const html = render(WalletHoldings, {
		props: {
			pageAddress: 'Y',
			account,
			tokens: [{ ...token, balance: Number.NaN }],
			tokenState: 'ready'
		}
	}).body;
	expect(html).not.toMatch(/Unavailable\s+TOK/);
});
