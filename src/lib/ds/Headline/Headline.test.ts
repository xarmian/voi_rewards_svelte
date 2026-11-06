import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import Headline from './Headline.svelte';
import { summarizeWallet, type WalletSummary } from '../../wallet/summary';

const base = summarizeWallet({
	owner: null,
	contracts: [],
	current: null,
	history: [],
	state: 'ready',
	now: 0
});
const summary = (patch: Partial<WalletSummary>): WalletSummary => ({ ...base, ...patch });
const html = (value: WalletSummary) =>
	render(Headline, {
		props: { account: { name: 'Shelly', addr: 'OWNER' }, summary: value, onretry: () => {} }
	}).body.replace(/<!--[\s\S]*?-->/g, '');
const text = (value: WalletSummary) =>
	html(value)
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
const earning = summary({
	contractCount: 16,
	onlineAccounts: 3,
	onlineContracts: 3,
	stakedOnline: 55940000,
	tooEarly: false,
	current: {
		epoch: 104,
		blocks: 10388,
		expected: 9800,
		ratio: 1.06,
		reward: 107500,
		share: 0.0819,
		progress: 0.5
	}
});

it('rule 1: error wins over earning and offers Retry', () => {
	const value = { ...earning, state: 'error' as const };
	expect(text(value)).toContain("We couldn't load Shelly's staking data.");
	expect(html(value)).toMatch(/<button[^>]*>Retry<\/button>/);
	expect(text(value)).not.toContain('107.5k');
});
it('rule 2: no contracts and offline', () => {
	expect(text(base)).toBe("Shelly isn't staking: no online key and no lock contracts.");
});
it('rule 3: urgent key warning takes priority and appends earning context', () => {
	const value = { ...earning, keyDays: 4, keyTone: 'danger' as const };
	expect(text(value)).toMatch(
		/^Shelly's participation key expires in 4 days: renew it to keep earning\./
	);
	expect(text(value)).toContain('107.5k VOI');
	expect(text({ ...value, keyDays: -1 })).toContain('participation key has expired');
});
it('rule 4: online and enough expected blocks', () => {
	expect(text(earning)).toBe(
		'Shelly has 55.9M VOI earning across 3 contracts, on track for ≈107.5k VOI this epoch (106% of expected).'
	);
	expect(html(earning)).toContain('<strong>');
});
it('rule 5: early epoch has no reward projection', () => {
	expect(text({ ...earning, tooEarly: true })).toBe(
		"Shelly has 55.9M VOI online; it's too early in epoch 104 to project rewards."
	);
});
it('rule 6: idle contracts and idle warning alongside earning', () => {
	expect(text(summary({ contractCount: 13, idleBalance: 576000 }))).toBe(
		"Shelly has 576k VOI in contracts that aren't staking: register a key to earn."
	);
	expect(text({ ...earning, idleBalance: 576000 })).toContain(
		"576k VOI in contracts that aren't staking"
	);
});
it('SSR loading never claims the account is offline or has zero stake', () => {
	const result = html({ ...base, state: 'loading' });
	expect(result).toContain('aria-busy="true"');
	expect(result).not.toContain("isn't staking");
});

it('rule 6 ignores drained contracts but includes a 5 VOI offline contract', () => {
	const owner = {
		address: 'OWNER',
		balance: 0,
		isParticipating: false,
		contractId: 0,
		voteLastValid: null,
		round: 0,
		lastVoteAt: null,
		lastBlock: null
	};
	const rollup = (balance: number) =>
		summarizeWallet({
			owner,
			contracts: [{ ...owner, address: 'C', balance }],
			current: null,
			history: [],
			state: 'ready',
			now: 0
		});
	expect(text({ ...rollup(0.1), contractsReady: true })).not.toContain(
		"in contracts that aren't staking"
	);
	expect(text({ ...rollup(5), contractsReady: true })).toContain(
		"5 VOI in contracts that aren't staking"
	);
});

it('rule 4 attributes owner stake separately and pluralises one contract', () => {
	expect(text({ ...earning, onlineContracts: 1, onlineAccounts: 2 })).toContain(
		'earning across the owner and 1 contract,'
	);
	expect(text({ ...earning, onlineContracts: 1, onlineAccounts: 1 })).toContain(
		'earning across 1 contract,'
	);
	expect(text({ ...earning, onlineContracts: 3, onlineAccounts: 4 })).toContain(
		'earning across the owner and 3 contracts,'
	);
});

it('initial contract loading is busy, not an error alert', () => {
	const result = html({
		...base,
		state: 'loading',
		contractSet: 'unavailable',
		contractsReady: false
	});
	expect(result).toContain('aria-busy="true"');
	expect(result).not.toContain('role="alert"');
	expect(html({ ...base, state: 'error' })).toContain('role="alert"');
});
