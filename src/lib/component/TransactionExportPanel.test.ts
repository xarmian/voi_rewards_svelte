import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import * as svelte from 'svelte';
// @ts-expect-error Svelte's compiler-generated SSR runtime has no public declarations.
import * as server from 'svelte/internal/server'; // eslint-disable-line svelte/no-svelte-internal -- Used only to execute compiler output in this test.
import * as arcReader from '$lib/services/arc200Export';
import * as arcExport from '$lib/wallet/arc200Export';
import * as ds from '$lib/ds';
import * as rewards from '$lib/rewards/calculateEpochRewards';
import * as options from '$lib/wallet/transactionExport';
import * as staking from '$lib/wallet/stakingContracts';
import * as csv from '$lib/wallet/transactionCsv';
import * as service from '$lib/services/transactionExport';
import { render } from 'svelte/server';
import Panel from './TransactionExportPanel.svelte';

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
	expect(html).toContain('Block rewards');
	expect(html.indexOf('Known reward payouts')).toBeLessThan(html.indexOf('Block rewards'));
	expect(html.indexOf('Block rewards')).toBeLessThan(html.indexOf('Asset transfers'));
	for (const copy of [
		'Export native VOI, ASA/VSA and ARC-200 transfer records for selected accounts. All assets includes ARC-200. LP positions and valuations are excluded.',
		'When Fees is selected, all VOI fees paid by selected accounts are included, regardless of asset.',
		'Up to 200 data pages, 100,000 rows or 200 asset/token definitions.',
		'ARC-200 scanning stops if a round fills a 100-record window.',
		'ARC-200 history is scanned in windows of up to 1,000,000 rounds; long date ranges or many accounts may reach the cap.',
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
function renderSelection(assetMode: 'all' | 'asset', transfers: boolean, completed = false) {
	const source = readFileSync(new URL('./TransactionExportPanel.svelte', import.meta.url), 'utf8');
	const seeded = source.replace(
		'</script>',
		`assetMode = ${JSON.stringify(assetMode)};
		types = ${JSON.stringify(transfers ? ['asset-transfer'] : ['payment'])};
		${
			completed
				? `
		frozen = { assets: { mode: 'all' }, allDates: true, addresses: ['A'] };
		result = {
			status: 'partial-source', reason: 'ARC-200 history completeness is unverified.',
			warnings: [ARC200_SOURCE_WARNING], rows: [], snapshotRound: 100n,
			dataResponses: 2, scanned: 0, arc200Scanned: 0,
			completedAddresses: ['A'], unfinishedAddresses: [],
			sourceScans: { indexer: ['A'], arc200: ['A'] }, canRetry: false
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
		'$lib/ds': ds,
		'$lib/rewards/calculateEpochRewards': rewards,
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
