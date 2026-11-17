import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { beforeEach, expect, it, vi } from 'vitest';
const flag = vi.hoisted(() => ({ testing: true }));
vi.mock('$lib/rewards/blockRewardLabels', async (original) => ({
	...(await original<typeof import('$lib/rewards/blockRewardLabels')>()),
	get REALTIME_BLOCK_REWARDS_TESTING() {
		return flag.testing;
	}
}));
import { compile } from 'svelte/compiler';
import * as svelte from 'svelte';
// @ts-expect-error Svelte's compiler-generated SSR runtime has no public declarations.
import * as server from 'svelte/internal/server'; // eslint-disable-line svelte/no-svelte-internal -- Used only to execute compiler output in this test.
import * as arcReader from '$lib/services/arc200Export';
import * as arcExport from '$lib/wallet/arc200Export';
import * as nftReader from '$lib/services/arc72Export';
import * as nftExport from '$lib/wallet/arc72Export';
import * as ds from '$lib/ds';
import * as rewards from '$lib/rewards/calculateEpochRewards';
import * as labels from '$lib/rewards/blockRewardLabels';
import * as options from '$lib/wallet/transactionExport';
import * as staking from '$lib/wallet/stakingContracts';
import * as csv from '$lib/wallet/transactionCsv';
import * as service from '$lib/services/transactionExport';
import { render } from 'svelte/server';
import Panel from './TransactionExportPanel.svelte';

beforeEach(() => {
	flag.testing = true;
});
const drawPanel = () =>
	render(Panel, {
		props: {
			pageAddress: 'A',
			suggestions: [],
			suggestionsAvailable: false,
			stakingContracts: [],
			stakingContractsAvailable: false,
			onclose: () => {}
		}
	}).body.replace(/\s+/g, ' ');
const blockRewardOption = (html: string) =>
	html.match(/<input[^>]*value="block-reward"[^>]*>(?:<!---->)?([^<]*)<\/label>/)?.[1];

it('labels the block reward choice as real-time, marked testing while in testing', () => {
	expect(blockRewardOption(drawPanel())).toBe('Real-time block rewards (testing)');
	flag.testing = false;
	expect(blockRewardOption(drawPanel())).toBe('Real-time block rewards');
});

it('shows labelled asset choices without the ARC source warning for the native default', () => {
	const { body } = render(Panel, {
		props: {
			pageAddress: 'A',
			suggestions: [],
			suggestionsAvailable: false,
			stakingContracts: [],
			stakingContractsAvailable: false,
			onclose: () => {}
		}
	});
	const html = body.replace(/\s+/g, ' ');
	expect(html).toContain('Export wallet activity');
	expect(html).toMatch(/<label[^>]*for="export-assets"[^>]*>Assets<\/label>/);
	expect(html).toMatch(/<select[^>]*id="export-assets"[^>]*aria-describedby="export-assets-help"/);
	expect(html).toMatch(/<option[^>]*value="native"[^>]*selected[^>]*>VOI only<\/option>/);
	expect(html).toContain('VOI and all assets (ASA/VSA + ARC-200)');
	expect(html).toContain('One asset (ASA/VSA)');
	expect(html).toMatch(/<input[^>]*value="asset-transfer"[^>]*checked/);
	expect(html).toContain('Asset transfers');
	expect(html).toMatch(/<input[^>]*value="block-reward"[^>]*checked/);
	expect(html).toContain('Real-time block rewards (testing)');
	expect(html.indexOf('Epoch rewards')).toBeLessThan(
		html.indexOf('Real-time block rewards (testing)')
	);
	expect(html.indexOf('Real-time block rewards (testing)')).toBeLessThan(
		html.indexOf('Asset transfers')
	);
	for (const copy of [
		'Export native VOI, ASA/VSA and ARC-200 transfer records for selected accounts, and NFT (ARC-72) transfers when selected. All assets includes ARC-200. LP positions and valuations are excluded.',
		'When Fees is selected, all VOI fees paid by selected accounts are included, regardless of asset.',
		'Up to 200 data pages, 100,000 rows or 200 asset/token definitions.',
		'ARC-200 scanning stops if a round fills a 100-record window.',
		'ARC-200 history is scanned in windows of up to 1,000,000 rounds; long date ranges or many accounts may reach the cap.',
		nftExport.ARC72_CAP_WARNING,
		'Zero-amount asset transfers and close-outs are included.'
	]) {
		expect(html).toContain(copy);
		expect(html.indexOf(copy)).toBeLessThan(html.indexOf('Start export'));
	}
	expect(html).not.toContain(arcExport.ARC200_SOURCE_WARNING);
	expect(html).not.toContain('NFTs are not included');
	expect(html).not.toContain('Staking labels are unavailable.');
	expect(html).toContain('estimated rewards are excluded.');
});

it.each([true, false])(
	'discloses staking coverage with availability %s',
	(stakingContractsAvailable) => {
		const { body } = render(Panel, {
			props: {
				pageAddress: 'A',
				suggestions: [],
				suggestionsAvailable: true,
				stakingContracts: [{ address: 'CONTRACT', contractId: 12 }],
				stakingContractsAvailable,
				onclose: () => {}
			}
		});
		const html = body.replace(/\s+/g, ' ');
		expect(html).toContain(
			'The Staking contract column marks transfers to and from the staking contracts this wallet owns now, as this site knows them. Contracts it owned earlier are not marked unless you add their address.'
		);
		expect(html).not.toContain('Staking labels are unavailable.');
		expect(html).toContain('id="export-types-help"');
		expect(html).toContain('aria-describedby="export-types-help"');
		const warning =
			"Staking contracts couldn't be loaded, so the Staking contract column will be empty.";
		expect(html.includes(warning)).toBe(!stakingContractsAvailable);
	}
);

it('names the epoch reward choice and uses no payout wording', () => {
	const html = drawPanel();
	const attributes = [...html.matchAll(/\s[\w:-]+="([^"]*)"/g)].map((match) => match[1]);
	const text = html.replace(/<[^>]+>/g, ' ');
	expect(text).toContain('Epoch rewards');
	expect(html).toMatch(/<input[^>]*value="epoch-reward"[^>]*checked/);
	expect(html).toContain('Epoch rewards are native VOI only, classified by sender;');
	expect([text, ...attributes].join(' ')).not.toMatch(/payout/i);
});

it('removes the obsolete ARC-200 exclusion', () => {
	const { body } = render(Panel, {
		props: {
			pageAddress: 'A',
			suggestions: [],
			suggestionsAvailable: true,
			stakingContracts: [],
			stakingContractsAvailable: true,
			onclose: () => {}
		}
	});
	expect(body).not.toContain("ARC-200 tokens aren't included");
});

// SSR has no DOM events. Seed only the panel's local state, then compile and render
// its real template and derived expressions with statically imported dependencies.
function renderSelection(
	assetMode: 'all' | 'asset',
	transfers: boolean,
	completed = false,
	nft = false,
	frozenTypes?: string[],
	reason = 'ARC-200 history completeness is unverified.'
) {
	const source = readFileSync(new URL('./TransactionExportPanel.svelte', import.meta.url), 'utf8');
	const seeded = source.replace(
		'</script>',
		`assetMode = ${JSON.stringify(assetMode)};
		types = ${JSON.stringify(transfers ? ['asset-transfer'] : ['payment'])};
		${
			completed
				? `
		frozen = { assets: { mode: 'all' }, allDates: true, addresses: ${nft ? "['A', 'B']" : "['A']"},
			types: ${JSON.stringify(frozenTypes ?? (nft ? ['asset-transfer', 'nft-transfer'] : ['asset-transfer']))} };
		result = {
			status: 'partial-source', reason: ${JSON.stringify(reason)},
			warnings: [ARC200_SOURCE_WARNING], rows: [], snapshotRound: 100n,
			dataResponses: 2, scanned: 0, arc200Scanned: 0, arc72Scanned: 0,
			completedAddresses: ['A'], unfinishedAddresses: ${nft ? "['B']" : '[]'},
			${nft ? "boundary: { source: 'arc72', address: 'B', upperRound: 50n }," : ''}
			sourceScans: { indexer: ${nft ? "['A', 'B']" : "['A']"}, arc200: ${nft ? "['A', 'B']" : "['A']"}, arc72: ${nft ? "['A']" : '[]'} }, canRetry: false
		};`
				: ''
		}
		</script>`
	);
	const modules: Record<string, unknown> = {
		'svelte/internal/server': server,
		svelte,
		'$lib/services/arc200Export': arcReader,
		'$lib/wallet/arc200Export': arcExport,
		'$lib/services/arc72Export': nftReader,
		'$lib/wallet/arc72Export': nftExport,
		'$lib/ds': ds,
		'$lib/rewards/calculateEpochRewards': rewards,
		'$lib/rewards/blockRewardLabels': labels,
		'$lib/wallet/transactionExport': options,
		'$lib/wallet/stakingContracts': staking,
		'$lib/wallet/transactionCsv': csv,
		'$lib/services/transactionExport': service
	};
	const context = createContext({ exports: {}, require: (id: string) => modules[id] });
	const compiled = compile(seeded, {
		generate: 'server',
		filename: 'TransactionExportPanel.svelte'
	});
	runInContext(
		ts.transpileModule(compiled.js.code, {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
		}).outputText,
		context
	);
	return render(context.exports.default, {
		props: {
			pageAddress: 'A',
			suggestions: [],
			suggestionsAvailable: true,
			stakingContracts: [],
			stakingContractsAvailable: true,
			onclose: () => {}
		}
	}).body;
}

it.each([
	['all', true, 1],
	['all', false, 0],
	['asset', true, 0]
] as const)(
	'renders %s with Asset transfers %s with %i ARC source warnings',
	(mode, transfers, count) => {
		expect(renderSelection(mode, transfers).split(arcExport.ARC200_SOURCE_WARNING)).toHaveLength(
			count + 1
		);
	}
);

it('shows the ARC source warning only once when the run result supplies it', () => {
	expect(renderSelection('all', true, true).split(arcExport.ARC200_SOURCE_WARNING)).toHaveLength(2);
});

it('offers legacy protocol rewards, checked by default, and explains where they are listed', () => {
	const html = drawPanel();
	expect(
		html.match(/<input[^>]*value="protocol-reward"[^>]*>(?:<!---->)?([^<]*)<\/label>/)?.[1]
	).toBe('Legacy protocol rewards');
	expect(html).toMatch(/<input[^>]*value="protocol-reward"[^>]*checked/);
	expect(html.indexOf('value="block-reward"')).toBeLessThan(
		html.indexOf('value="protocol-reward"')
	);
	expect(html.indexOf('value="protocol-reward"')).toBeLessThan(
		html.indexOf('value="asset-transfer"')
	);
	expect(html).toContain(
		'not Payments. Legacy protocol rewards are a one-time network credit to accounts that held VOI before round 8,320,707. It has no transaction of its own, so it is listed under the transaction that applied it.'
	);
});

it('offers NFT transfers after Asset transfers, unchecked by default, and explains them', () => {
	const html = drawPanel();
	expect(html.match(/<input[^>]*value="nft-transfer"[^>]*>(?:<!---->)?([^<]*)<\/label>/)?.[1]).toBe(
		'NFT transfers'
	);
	expect(html).not.toMatch(/<input[^>]*value="nft-transfer"[^>]*checked/);
	expect(html.indexOf('value="asset-transfer"')).toBeLessThan(html.indexOf('value="nft-transfer"'));
	expect(html.indexOf('value="nft-transfer"')).toBeLessThan(html.indexOf('value="close-out"'));
	const help = html.slice(html.indexOf('id="export-types-help"'));
	for (const copy of [
		'NFT transfers are ARC-72 transfer records from Mimir, including mints and burns.',
		'If one transaction moves the same NFT more than once, only the first move is recorded.',
		'The Assets choice does not apply to NFT transfers.'
	]) {
		expect(help).toContain(copy);
		expect(html.indexOf(copy)).toBeLessThan(html.indexOf('Start export'));
	}
	expect(html.split(nftExport.ARC72_SOURCE_NOTE)).toHaveLength(2);
});

it('reports NFT scope, scanned accounts and the NFT boundary after a run', () => {
	const html = renderSelection('all', true, true, true).replace(/\s+/g, ' ');
	expect(html).toContain('VOI and all assets (ASA/VSA + ARC-200) + NFT transfers');
	expect(html).toContain('NFT accounts scanned: 1');
	expect(html).toContain('Current account boundary: NFT at or before round 50.');
	const plain = renderSelection('all', true, true).replace(/\s+/g, ' ');
	expect(plain).not.toContain('+ NFT transfers');
	expect(plain).toContain('NFT accounts scanned: 0');
});

it('reports an NFT-only export as NFT transfers only, and a mixed one with + NFT transfers', () => {
	const only = renderSelection('all', true, true, true, ['nft-transfer']).replace(/\s+/g, ' ');
	expect(only).toContain('rows · NFT transfers only ·');
	expect(only).not.toContain('+ NFT transfers');
	expect(only).not.toContain('VOI and all assets (ASA/VSA + ARC-200) ·');
	const mixed = renderSelection('all', true, true, true, ['fee', 'nft-transfer']).replace(
		/\s+/g,
		' '
	);
	expect(mixed).toContain('rows · VOI and all assets (ASA/VSA + ARC-200) + NFT transfers ·');
	expect(mixed).not.toContain('NFT transfers only');
});

it('explains an empty partial-source export with the run reason, not a fixed ARC-200 line', () => {
	const nftOnly = renderSelection(
		'all',
		true,
		true,
		true,
		['nft-transfer'],
		'NFT history completeness is unverified.'
	).replace(/\s+/g, ' ');
	expect(nftOnly).toContain('No matching rows returned. NFT history completeness is unverified.');
	expect(nftOnly).not.toContain('ARC-200 history completeness is unverified.');
	const arc = renderSelection('all', true, true).replace(/\s+/g, ' ');
	expect(arc).toContain('No matching rows returned. ARC-200 history completeness is unverified.');
});
