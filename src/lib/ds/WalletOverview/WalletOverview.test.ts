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

it('keeps the owner liquid balance visible while contract holdings are unavailable', () => {
	const summary = summarizeWallet({
		owner: {
			address: 'OWNER',
			contractId: 0,
			balance: 1234,
			isParticipating: false,
			round: 100,
			voteLastValid: null,
			lastVoteAt: null,
			lastBlock: null
		},
		contracts: [],
		contractSet: 'unavailable',
		current: null,
		history: [],
		state: 'ready',
		now: 0
	});
	const html = render(WalletOverview, {
		props: { summary, contracts: [], current: null, pageAddress: 'OWNER', selected: null, now: 0 }
	}).body;
	const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
	expect(text).toContain('Liquid: 1,234 VOI');
	expect(text).toContain('Holdings valuation unavailable');
});

it('does not print a liquid balance on a contract route while holdings are unavailable', () => {
	// A contract route has no owner in view, so `liquid` is a placeholder zero, not a balance.
	const summary = summarizeWallet({
		owner: null,
		contracts: [],
		contractSet: 'unavailable',
		current: null,
		history: [],
		state: 'ready',
		now: 0
	});
	expect(summary.holdings.liquidKnown).toBe(false);
	const html = render(WalletOverview, {
		props: {
			summary,
			contracts: [],
			current: null,
			pageAddress: 'CONTRACT',
			selected: null,
			now: 0
		}
	}).body;
	const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
	expect(text).toContain('Holdings valuation unavailable');
	expect(text).not.toContain('Liquid:');
});
