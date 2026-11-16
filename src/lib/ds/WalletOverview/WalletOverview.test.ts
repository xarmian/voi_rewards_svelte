import { pageAccountState } from '$lib/chain/signerGate';
import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import WalletOverview from './WalletOverview.svelte';
import { summarizeWallet, type WalletContract } from '../../wallet/summary';

it.each([0, 1, 2])('leaves %i empty contracts out of the health ring', (emptyCount) => {
	const online: WalletContract = {
		address: 'ONLINE',
		contractId: 1,
		balance: 5,
		minBalance: 0.1,
		isParticipating: true,
		round: 100,
		voteLastValid: 10000000,
		lastVoteAt: '2026-10-25T00:00:00Z',
		lastBlock: 99,
		details: null
	};
	const contracts = [
		online,
		...Array.from({ length: emptyCount }, (_, i) => ({
			...online,
			address: `EMPTY${i}`,
			contractId: i + 2,
			balance: 0.2,
			minBalance: 0.2,
			isParticipating: false,
			voteLastValid: null
		}))
	];
	const now = Date.parse('2026-10-25T00:00:00Z');
	const summary = summarizeWallet({
		owner: null,
		contracts,
		current: null,
		history: [],
		state: 'ready',
		now
	});
	const html = render(WalletOverview, {
		props: {
			summary,
			contracts,
			current: null,
			pageAddress: 'OWNER',
			accountState: { state: 'read-only' },
			now
		}
	}).body;
	const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
	expect.soft(html).toContain('aria-label="1 of 1 contracts online"');
	if (emptyCount > 0) {
		expect(text).toContain(
			`0 VOI idle · ${emptyCount} empty ${emptyCount === 1 ? 'contract' : 'contracts'} not shown`
		);
	} else {
		expect(text).not.toContain('not shown');
	}
});

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
		props: {
			summary,
			contracts: [],
			current: null,
			pageAddress: 'OWNER',
			accountState: { state: 'read-only' },
			now: 0
		}
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

it('renders chart, Holdings, Lock contracts, and Next unlocks in DOM order', () => {
	const summary = summarizeWallet({
		owner: null,
		contracts: [],
		current: null,
		history: [],
		state: 'loading',
		now: 0
	});
	const html = render(WalletOverview, {
		props: {
			summary,
			contracts: [],
			current: null,
			pageAddress: 'OWNER',
			accountState: { state: 'read-only' },
			now: 0
		}
	}).body;
	const chart = html.indexOf('Blocks vs expected');
	const holdings = html.indexOf('Holdings');
	const contracts = html.indexOf('Lock contracts');
	const unlocks = html.indexOf('Next unlocks');
	expect(chart).toBeGreaterThanOrEqual(0);
	expect(chart).toBeLessThan(holdings);
	expect(holdings).toBeLessThan(contracts);
	expect(contracts).toBeLessThan(unlocks);
});

it.each([
	[1, '1 contract not staking'],
	[2, '2 contracts not staking']
])('uses the correct idle contract plural for %i idle contracts', (idleCount, title) => {
	const contracts: WalletContract[] = Array.from({ length: idleCount }, (_, i) => ({
		address: `IDLE${i}`,
		contractId: i + 1,
		balance: 5000,
		minBalance: 0.1,
		isParticipating: false,
		round: 0,
		voteLastValid: null,
		lastVoteAt: null,
		lastBlock: null,
		details: null
	}));
	const summary = summarizeWallet({
		owner: null,
		contracts,
		current: null,
		history: [],
		state: 'ready',
		now: 0
	});
	expect(summary.idleCount).toBe(idleCount);
	const html = render(WalletOverview, {
		props: {
			summary,
			contracts,
			current: null,
			pageAddress: 'OWNER',
			accountState: { state: 'read-only' },
			now: 0
		}
	}).body;
	expect(html).toContain(title);
	expect(html).not.toContain('1 contracts not staking');
});

it.each([
	['OWNER', true],
	['OTHER', false]
])('overview row menu for connected account %s requires page ownership', (address, visible) => {
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
			accountState: pageAccountState('OWNER', [{ address, app: 'kibisis' }]),
			now: 0
		}
	}).body;
	expect(html.includes('aria-haspopup="menu"')).toBe(visible);
});

it.each([
	['yours', true],
	['read-only', false]
])('idle contract hint renders only when the page account is %s', (state, hint) => {
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
			accountState:
				state === 'yours'
					? pageAccountState('OWNER', [{ address: 'OWNER', app: 'kibisis' }])
					: { state: 'read-only' },
			now: 0
		}
	}).body;
	const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
	expect(text).toContain('1 contract not staking');
	expect(text).toContain('VOI idle');
	expect(text.includes('register a key in Contracts to earn')).toBe(hint);
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
		props: {
			summary,
			contracts: [],
			current: null,
			pageAddress: 'OWNER',
			accountState: { state: 'read-only' },
			now: 0
		}
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
			accountState: { state: 'read-only' },
			now: 0
		}
	}).body;
	const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
	expect(text).toContain('Holdings valuation unavailable');
	expect(text).not.toContain('Liquid:');
});

it('renders a Block rewards card after Next unlocks, with an unknown status when the owner lookup failed', () => {
	const draw = (ownerLookup: 'ok' | 'unavailable') =>
		render(WalletOverview, {
			props: {
				summary: summarizeWallet({
					owner: null,
					contracts: [],
					current: null,
					history: [],
					state: 'ready',
					ownerLookup,
					now: 0
				}),
				contracts: [],
				current: null,
				pageAddress: 'OWNER',
				accountState: { state: 'read-only' },
				now: 0
			}
		}).body;
	const html = draw('ok');
	const heading = html.search(/<h2[^>]*>Block rewards(?:<!---->)?<\/h2>/);
	expect(heading).toBeGreaterThan(html.indexOf('Next unlocks'));
	expect(html).not.toContain('Block reward registration status unavailable');
	expect(draw('unavailable')).toContain('Block reward registration status unavailable');
});
