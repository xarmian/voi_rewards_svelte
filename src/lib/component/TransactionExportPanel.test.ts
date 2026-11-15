import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import Panel from './TransactionExportPanel.svelte';

it('shows labelled asset choices and transfer disclosure before Start with native scope selected', () => {
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
	for (const copy of [
		'Export native VOI, ASA/VSA and ARC-200 transfer records for selected accounts. All assets includes ARC-200. LP positions and valuations are excluded.',
		'When Fees is selected, all VOI fees paid by selected accounts are included, regardless of asset.',
		'Up to 200 data pages, 100,000 rows or 200 asset/token definitions.',
		'ARC-200 history is partial: the source may omit transfer logs or lag behind the snapshot.',
		'Event identity and order within a round cannot be verified.',
		'Missing decimals are exported as raw units.',
		'ARC-200 scanning stops if a round fills a 100-record window.',
		'ARC-200 history is scanned in windows of up to 1,000,000 rounds; long date ranges or many accounts may reach the cap.',
		'Zero-amount asset transfers and close-outs are included.'
	]) {
		expect(html).toContain(copy);
		expect(html.indexOf(copy)).toBeLessThan(html.indexOf('Start export'));
	}
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
