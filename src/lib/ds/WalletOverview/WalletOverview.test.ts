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
});

it.each([
	['OWNER', true],
	['OTHER', false]
])('overview row menu for selected %s requires page ownership', (address, visible) => {
	const contracts = [
		{
			address: 'ESCROW',
			contractId: 1,
			balance: 5,
			isParticipating: false,
			round: 0,
			voteLastValid: null,
			lastVoteAt: null,
			lastBlock: null,
			details: {
				owner: 'OWNER',
				availableForWithdrawal: 0,
				lockedBalance: 0,
				nextVestingDate: null
			}
		}
	] as import('../../wallet/summary').WalletContract[];
	const summary = summarizeWallet({
		owner: null,
		contracts,
		current: null,
		history: [],
		state: 'ready',
		now: 0
	});
	const html = render(WalletOverview, {
		props: {
			summary,
			contracts,
			current: null,
			pageAddress: 'OWNER',
			selected: { address, app: 'kibisis' },
			now: 0
		}
	}).body;
	expect(html.includes('aria-haspopup="menu"')).toBe(visible);
});
