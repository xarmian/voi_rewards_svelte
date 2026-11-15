import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import Panel from './TransactionExportPanel.svelte';

it('shows labelled asset choices and transfer disclosure before Start with native scope selected', () => {
	const { body } = render(Panel, {
		props: { pageAddress: 'A', suggestions: [], suggestionsAvailable: false, onclose: () => {} }
	});
	const html = body.replace(/\s+/g, ' ');
	expect(html).toContain('Export wallet activity');
	expect(html).toMatch(/<label[^>]*for="export-assets"[^>]*>Assets<\/label>/);
	expect(html).toMatch(/<select[^>]*id="export-assets"[^>]*aria-describedby="export-assets-help"/);
	expect(html).toMatch(/<option[^>]*value="native"[^>]*selected[^>]*>VOI only<\/option>/);
	expect(html).toContain('VOI and all assets');
	expect(html).toContain('One asset (ASA/VSA)');
	expect(html).toMatch(/<input[^>]*value="asset-transfer"[^>]*checked/);
	expect(html).toContain('Asset transfers');
	for (const copy of [
		"Export native VOI and ASA/VSA transfer activity for the selected assets. ARC-200 tokens aren't included. LP positions and valuations aren't included.",
		'When Fees is selected, all VOI fees paid by selected accounts are included, regardless of asset.',
		'Up to 200 pages, 100,000 rows or 200 asset definitions per export',
		'Zero-amount asset transfers and close-outs are included.'
	]) {
		expect(html).toContain(copy);
		expect(html.indexOf(copy)).toBeLessThan(html.indexOf('Start export'));
	}
	expect(html).not.toContain('NFTs are not included');
	expect(html).toContain('Staking labels are unavailable.');
	expect(html).toContain('estimated rewards are excluded.');
});
