import { pageAccountState } from '$lib/chain/signerGate';
import { describe, expect, it, vi } from 'vitest';
vi.mock('$lib/component/RegisterVoteKey.svelte', () => ({ default: () => {} }));
import { render } from 'svelte/server';
import WalletOverview from './WalletOverview.svelte';
import { summarizeWallet, type WalletAccount, type WalletContract } from '../../wallet/summary';
import type { Eligibility, Heartbeat } from '../../wallet/nodeHealth';
import { BLOCK_REWARD_STATUS_TEXT, type BlockRewardReason } from '$lib/rewards/blockRewardStatus';

it.each([0, 1, 2])('leaves %i empty contracts out of the health ring', (emptyCount) => {
	const online: WalletContract = {
		address: 'ONLINE',
		contractId: 1,
		balance: 5,
		minBalance: 0.1,
		isParticipating: true,
		round: 100,
		voteLastValid: 10000000,
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
			voteLastValid: null
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
	const heading = html.search(/<h2[^>]*>Real-time block rewards(?:<!---->)?<\/h2>/);
	expect(heading).toBeGreaterThan(html.indexOf('Next unlocks'));
	expect(html).not.toContain('Real-time block reward registration status unavailable');
	expect(draw('unavailable')).toContain('Real-time block reward registration status unavailable');
});

describe('node health eligibility and heartbeat', () => {
	const NOW = Date.parse('2026-10-25T00:00:00Z');
	const eligibility = (reasons: BlockRewardReason[], canMakeEligible = false): Eligibility => ({
		status: {
			registered: reasons.length === 0,
			reasons: reasons.map((code) => ({ code, text: BLOCK_REWARD_STATUS_TEXT[code] }))
		},
		canMakeEligible
	});
	const heartbeat = (overrides: Partial<Heartbeat> = {}): Heartbeat => ({
		lastProposedSeconds: 600,
		lastHeartbeatSeconds: 7200,
		silentRounds: 215,
		overdueAfter: 10_000,
		overdue: false,
		...overrides
	});
	const ownerAccount = (overrides: Partial<WalletAccount> = {}): WalletAccount => ({
		address: 'OWNER',
		contractId: 0,
		balance: 50_000,
		isParticipating: true,
		round: 100,
		voteLastValid: 10_000_000,
		health: { eligibility: eligibility(['not-opted-in'], true), heartbeat: heartbeat() },
		...overrides
	});
	const contract = (overrides: Partial<WalletContract> = {}): WalletContract => ({
		address: 'ESCROW',
		contractId: 7,
		balance: 40_000,
		isParticipating: true,
		round: 100,
		voteLastValid: 10_000_000,
		health: { eligibility: eligibility(['contract']), heartbeat: heartbeat() },
		details: null,
		...overrides
	});
	const draw = (
		owner: WalletAccount | null,
		contracts: WalletContract[],
		state: 'yours' | 'read-only' = 'yours'
	) => {
		const html = render(WalletOverview, {
			props: {
				summary: summarizeWallet({
					owner,
					contracts,
					current: null,
					history: [],
					state: 'ready',
					now: NOW
				}),
				contracts,
				current: null,
				pageAddress: 'OWNER',
				accountState:
					state === 'yours'
						? pageAccountState('OWNER', [{ address: 'OWNER', app: 'kibisis' }])
						: { state: 'read-only' },
				now: NOW
			}
		}).body.replace(/<!--[\s\S]*?-->/g, '');
		const health = html.slice(0, html.indexOf('This epoch so far'));
		return {
			html: health,
			text: health
				.replace(/<[^>]+>/g, ' ')
				.replace(/&#39;/g, "'")
				.replace(/\s+/g, ' ')
		};
	};

	it('shows the shared pill and reasons for the owner and each online contract', () => {
		const { text } = draw(ownerAccount(), [contract()]);
		expect(text).toContain('This account');
		expect(text).toContain('Contract #7');
		expect(text.match(/Not registered for real-time block rewards/g)).toHaveLength(2);
		expect(text).toContain('Online without the 2 VOI incentive fee.');
		expect(text).toContain(BLOCK_REWARD_STATUS_TEXT.contract);
	});

	it('no longer shows vote or last-block health', () => {
		const { text } = draw(ownerAccount(), [contract()]);
		expect(text).not.toMatch(/Voted|Oldest vote|last block|Last vote/);
	});

	it('shows the last proposed and last heartbeat ages', () => {
		const { text } = draw(ownerAccount(), [contract()]);
		expect(text).toContain('Last proposed 10m ago · last heartbeat 2h ago');
		expect(text).not.toContain('Heartbeat overdue');
	});

	it('warns when a heartbeat is overdue, without promising a time', () => {
		const late = contract({
			health: {
				eligibility: eligibility(['contract']),
				heartbeat: heartbeat({ overdue: true, silentRounds: 20_000 })
			}
		});
		const { text } = draw(ownerAccount(), [late]);
		expect(text).toContain('Heartbeat overdue');
		expect(text).toContain('may be suspended soon if it stays silent');
		expect(text).toContain('Needs attention');
	});

	it('says staleness is unchecked when online stake was unavailable', () => {
		const owner = ownerAccount({
			health: {
				eligibility: eligibility([]),
				heartbeat: heartbeat({ overdue: null, overdueAfter: null })
			}
		});
		const { text } = draw(owner, []);
		expect(text).toContain('Last proposed 10m ago');
		expect(text).toContain('Online stake unavailable');
		expect(text).not.toContain('Heartbeat overdue');
	});

	it('says there are no online accounts instead of a missing record when none is online', () => {
		const offline = ownerAccount({
			isParticipating: false,
			health: { eligibility: eligibility(['offline']), heartbeat: null }
		});
		const { text } = draw(offline, []);
		expect(text).toContain('No online accounts.');
		expect(text).not.toContain('No proposal or heartbeat on record');
	});

	it('flags suspended accounts as dangerous', () => {
		const taken = contract({
			isParticipating: false,
			health: { eligibility: eligibility(['suspended']), heartbeat: null }
		});
		const { text } = draw(ownerAccount(), [taken]);
		expect(text).toContain('1 account suspended');
		expect(text).toContain('Taken offline for missing proposals (suspended).');
	});

	it('offers Make eligible on the owner row only when the page is yours and an offer exists', () => {
		const offer = draw(ownerAccount(), [contract()]);
		expect(offer.text.match(/Make eligible \(2 VOI\)/g)).toHaveLength(1);
		expect(draw(ownerAccount(), [contract()], 'read-only').text).not.toContain('Make eligible');
		const eligible = ownerAccount({
			health: { eligibility: eligibility([]), heartbeat: heartbeat() }
		});
		expect(draw(eligible, []).text).not.toContain('Make eligible');
		const noOffer = ownerAccount({
			health: { eligibility: eligibility(['not-opted-in'], false), heartbeat: heartbeat() }
		});
		expect(draw(noOffer, []).text).not.toContain('Make eligible');
	});

	it('never puts the button on a contract entry, even one with an offer', () => {
		const capable = contract({
			health: { eligibility: eligibility(['not-opted-in'], true), heartbeat: heartbeat() }
		});
		expect(draw(null, [capable]).text).not.toContain('Make eligible');
	});
});
