import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import WalletOverview from './WalletOverview.svelte';
import { summarizeWallet } from '../../wallet/summary';

it('server-renders the complete Overview skeleton without claiming zero balances', () => {
	const summary = summarizeWallet({
		owner: null,
		contracts: [],
		current: null,
		history: [],
		state: 'loading',
		now: 0
	});
	const html = render(WalletOverview, {
		props: { summary, contracts: [], current: null, pageAddress: 'OWNER', selected: null, now: 0 }
	}).body;
	for (const title of [
		'Node health',
		'This epoch so far',
		'Blocks vs expected',
		'Next unlocks',
		'Lock contracts',
		'Holdings'
	]) {
		expect(html).toContain(title);
	}
	expect(html).toContain('aria-busy="true"');
	expect(html).not.toContain('0 VOI');
	expect(html).not.toContain('aria-haspopup="menu"');
});
