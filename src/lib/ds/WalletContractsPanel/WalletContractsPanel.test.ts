import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import WalletContractsPanel from './WalletContractsPanel.svelte';
import { contractFixture, scheduleNow } from '$lib/wallet/contracts.fixtures';
import type { WalletContract } from '$lib/wallet/summary';
const props = {
	current: null,
	pageAddress: 'OWNER',
	selected: null,
	state: 'ready' as const,
	now: scheduleNow,
	onrefresh: vi.fn()
};
const text = (html: string) =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ');
it('composes three aggregate tiles, one scheduled unlock chart and full disclosure table', () => {
	const html = render(WalletContractsPanel, {
		props: { ...props, contracts: [contractFixture()] }
	}).body;
	const words = text(html);
	for (const label of [
		'Contracts',
		'Locked VOI',
		'Withdrawable now',
		'Scheduled unlocks',
		'Contract schedule; not a guarantee of withdrawable balance.',
		'Details for contract #1'
	])
		expect(words).toContain(label);
	expect(words).toContain('3.9');
	expect(words).toContain('8');
	expect(html.match(/aria-roledescription="chart"/g)).toHaveLength(1);
	expect(html).not.toContain('aria-haspopup="menu"');
});
it('partial amounts stay unavailable and schedules show an alert rather than fabricated releases', () => {
	const html = render(WalletContractsPanel, {
		props: { ...props, contracts: [contractFixture(), { ...contractFixture(2), details: null }] }
	}).body;
	const words = text(html);
	expect(words).toMatch(/Locked VOI Unavailable/);
	expect(words).toMatch(/Withdrawable now Unavailable/);
	expect(words).toContain('totals are incomplete');
	expect(words).toContain('Schedule unavailable');
	expect(html).toContain('role="alert"');
	expect(html).toContain('href="/wallet/CONTRACT1"');
	expect(html).not.toContain('aria-roledescription="chart"');
});
it('successful empty and fully vested populations show no scheduled unlocks', () => {
	for (const contracts of [
		[],
		[
			contractFixture(1, {
				isFullyVested: true,
				nextVestingDate: null,
				nextVestingAmount: 0,
				remainingVestingAmount: 0,
				lockedBalance: 0
			})
		]
	]) {
		const words = text(render(WalletContractsPanel, { props: { ...props, contracts } }).body);
		expect(words).toContain('No scheduled unlocks');
		if (!contracts.length) expect(words).toContain('No lock contracts');
	}
});
it('loading uses tile, timeline and seven row skeletons without zero totals', () => {
	const html = render(WalletContractsPanel, {
		props: { ...props, contracts: [], state: 'loading' }
	}).body;
	expect(text(html)).toContain('Loading Scheduled unlocks');
	expect(html.match(/data-contract-skeleton/g)).toHaveLength(7);
	expect(html).toContain('aria-busy="true"');
	expect(text(html)).not.toContain('No lock contracts');
});
it('failed list retains an actual Retry and never claims no contracts', () => {
	const html = render(WalletContractsPanel, {
		props: {
			...props,
			contracts: [] as WalletContract[],
			state: 'error',
			contractSet: 'unavailable'
		}
	}).body;
	expect(text(html)).toContain('Lock contracts unavailable');
	expect(text(html)).toContain('Retry');
	expect(text(html)).not.toContain('No lock contracts');
});
