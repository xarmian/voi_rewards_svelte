import { beforeEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
vi.mock('$lib/wallet/rewards', async (original) => ({
	...(await original<typeof import('$lib/wallet/rewards')>()),
	createRewardsState: vi.fn()
}));
import { createRewardsState, validatePayouts } from '$lib/wallet/rewards';
import WalletRewards from './WalletRewards.svelte';
const ready = <T>(value: T) => ({ state: 'ready' as const, value, asOf: 1 });
function fixture() {
	return {
		epochs: ready([{ epoch: 62, blocks: 12, networkBlocks: 120, estimate: 140, current: false }]),
		payouts: ready(validatePayouts([])),
		daily: ready({ '2026-11-07': [1, 2] }),
		account: ready({ balance: 100, online: true }),
		eligible: ready([{ epoch_number: 62, eligible_online_stake: 1000 }]),
		dailyStake: ready([{ date: '2026-11-07', avg_online_stake: 1_000_000_000 }]),
		supply: ready(1000)
	};
}
const draw = () =>
	render(WalletRewards, { props: { pageAddress: 'Y', now: new Date('2026-11-07T12:00:00Z') } })
		.body;
beforeEach(() => vi.mocked(createRewardsState).mockReturnValue(fixture()));
it('renders Not found with an explanation and no absent transaction link', () => {
	const html = draw();
	expect(html).toContain('Not found');
	expect(html).toContain('No payment found in the following week.');
	expect(html).not.toContain('Missing');
	expect(html).not.toContain('/explorer/transaction/');
	expect(html).toContain('View data');
	expect(html).toContain('Rewards by epoch');
});
it('keeps estimates visible and payout cells Unavailable after payout failure', () => {
	vi.mocked(createRewardsState).mockReturnValue({
		...fixture(),
		payouts: { state: 'error', error: 'offline' }
	});
	const html = draw();
	expect(html).toContain('140');
	expect(html).toContain('Unavailable');
	expect(html).not.toContain('Not found');
	expect(html).toContain('Recorded payouts unavailable');
});
it('wires daily Retry and preserves bars when expected data fails', () => {
	const state = fixture();
	vi.mocked(createRewardsState).mockReturnValue({
		...state,
		dailyStake: { state: 'error', error: 'offline' }
	});
	const html = draw();
	expect(html).toContain('Expected proposals unavailable');
	expect(html).toContain('Retry');
	expect(html).toContain('<rect');
	expect(html).not.toContain('stroke-expected');
	vi.mocked(createRewardsState).mockReturnValue({
		...state,
		daily: { state: 'error', error: 'offline' }
	});
	const failedDaily = draw();
	expect(failedDaily).toContain('Daily proposals unavailable');
	expect(failedDaily).toMatch(/<button[^>]*>[\s\S]*?Retry/);
	const source = readFileSync(new URL('./WalletRewards.svelte', import.meta.url), 'utf8');
	const script = source.split('<script lang="ts">')[1].split('</script>')[0];
	const ast = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true);
	const fn = ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'retry')!;
	const load = vi.fn();
	const retry = runInNewContext(`${ts.transpile(fn.getText(ast))}; retry`, {
		readers: { daily: { load } },
		pageAddress: 'Y'
	});
	retry('daily');
	expect(load).toHaveBeenCalledWith('Y', true);
});
it('shows recorded payments outside row windows in View data without inventing a row link', () => {
	vi.mocked(createRewardsState).mockReturnValue({
		...fixture(),
		payouts: ready(
			validatePayouts([
				{ txid: 'outside', amount: 7_000_000, tx_timestamp: '2024-10-30T00:00:00Z' }
			])
		)
	});
	const html = draw();
	expect(html).toContain('outside');
	expect(html).toContain('2024-10-30');
	expect(html).not.toContain('/explorer/transaction/outside');
});
it('server rendering performs no reads and keeps all loading footprints', () => {
	const loading = { state: 'loading' as const };
	vi.mocked(createRewardsState).mockReturnValue({
		epochs: loading,
		payouts: loading,
		daily: loading,
		account: loading,
		eligible: loading,
		dailyStake: loading,
		supply: loading
	});
	const html = draw();
	expect(html).toContain('aria-busy="true"');
	expect(html).toContain('Daily proposals');
	expect(html).toContain('Recorded payouts');
});
