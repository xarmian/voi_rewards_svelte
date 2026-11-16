import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
vi.mock('$lib/wallet/rewards', async (original) => ({
	...(await original<typeof import('$lib/wallet/rewards')>()),
	createRewardsState: vi.fn()
}));
vi.mock('$lib/wallet/blockRewardsCard', async (original) => ({
	...(await original<typeof import('$lib/wallet/blockRewardsCard')>()),
	createBlockRewardsState: vi.fn()
}));
import { createRewardsState, validatePayouts } from '$lib/wallet/rewards';
import { createBlockRewardsState, type BlockRewardsState } from '$lib/wallet/blockRewardsCard';
import { BLOCK_REWARD_PAGE_SIZE, type BlockReward } from '$lib/wallet/blockRewards';
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
beforeEach(() => {
	vi.mocked(createRewardsState).mockReturnValue(fixture());
	vi.mocked(createBlockRewardsState).mockImplementation(
		() =>
			Object.fromEntries(
				Object.keys(blockFixture()).map((key) => [key, { state: 'loading' }])
			) as BlockRewardsState
	);
});
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

const PAUSED =
	'Block rewards are paused. Real-time block rewards are in testing; epoch rewards continue until testing is complete.';
const CONTRACT_TEXT =
	"Staking contracts don't earn block rewards yet. Contract upgrades are being worked on, and epoch rewards continue until contracts are upgraded to support real-time block rewards.";
const GO_ONLINE = /<a[^>]*href="#overview"[^>]*>\s*Go online with the 2 VOI incentive fee\s*<\/a>/g;
const reward = (round: number, overrides: Partial<BlockReward> = {}): BlockReward => ({
	round,
	time: '2026-11-07T10:00:00.000Z',
	txid: `TX${round}`,
	amount: 5_000_000,
	bonus: 5_000_000,
	feesCollected: 0,
	partial: false,
	...overrides
});
const networkDay = (day: string, lastRound: number | null = null) => ({
	day,
	blocks: 30_000,
	rewardedBlocks: 30_000,
	amount: 0,
	feesCollected: 3_000_000,
	lastRound
});
function blockFixture(): BlockRewardsState {
	return {
		status: ready({ registered: true, reasons: [], balance: 100_000_000_000 }),
		funding: ready({ funding: 'funded' as const, bonus: 5_000_000 }),
		daily: ready([
			{ day: '2026-10-09', count: 1, amount: 1_000_000 },
			{ day: '2026-10-31', count: 4, amount: 10_000_000 },
			{ day: '2026-11-01', count: 1, amount: 500_000 },
			{ day: '2026-11-03', count: 2, amount: 3_500_000 },
			{ day: '2026-11-07', count: 1, amount: 2_000_000 }
		]),
		network: ready(
			[
				'2026-10-31',
				'2026-11-01',
				'2026-11-02',
				'2026-11-03',
				'2026-11-04',
				'2026-11-05',
				'2026-11-06'
			]
				.map((day) => networkDay(day))
				.concat(networkDay('2026-11-07', 5_000_000))
		),
		onlineStake: ready(1_000_000_000_000_000),
		lastRound: ready(5_000_100),
		recent: ready([
			reward(5_000_050, {
				txid: 'AB/C+D',
				partial: true,
				amount: 4_000_000,
				feesCollected: 2_000_000
			}),
			reward(5_000_040)
		])
	};
}
const card = (html: string) => html.slice(html.indexOf('id="ds-card-block-rewards"'));
const drawBlock = (state: Partial<BlockRewardsState> = {}, isContract = false) => {
	vi.mocked(createBlockRewardsState).mockReturnValue({ ...blockFixture(), ...state });
	return render(WalletRewards, {
		props: { pageAddress: 'Y', isContract, now: new Date('2026-11-07T12:00:00Z') }
	}).body;
};
const tile = (html: string, label: string) => {
	const clean = html.replace(/<!--[\s\S]*?-->/g, '');
	const start = clean.indexOf(`>${label}</div>`);
	expect(start, label).toBeGreaterThan(0);
	return clean
		.slice(start + 1, start + 1500)
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ');
};

describe('Block rewards card', () => {
	it('shows today, 7-day and 30-day totals from the daily rows', () => {
		const html = card(drawBlock());
		expect(tile(html, 'Today (UTC)')).toMatch(/^Today \(UTC\) 2 VOI 1 block reward /);
		expect(tile(html, 'Last 7 days')).toMatch(/^Last 7 days 6 VOI 4 block rewards /);
		expect(tile(html, 'Last 30 days')).toMatch(/^Last 30 days 17 VOI 9 block rewards /);
	});

	it('never adds epoch figures to block reward figures', () => {
		const html = card(drawBlock());
		// The epoch fixture estimates 140 VOI; sums with any block reward total must not appear.
		for (const sum of ['142', '146', '157']) expect(html).not.toContain(`${sum} VOI`);
		expect(html).not.toContain('140 VOI');
	});

	it('shows the registered pill', () => {
		const html = card(drawBlock());
		expect(html).toContain('Registered for block rewards');
		expect(html).not.toContain('Not registered for block rewards');
		expect(html).toContain('Changes take effect after about 320 rounds (~15 minutes).');
	});

	it('lists every reason with a go-online link for each non-contract reason', () => {
		const html = card(
			drawBlock({
				status: ready({
					registered: false,
					balance: 1_000_000,
					reasons: [
						{ code: 'not-opted-in' as const, text: 'Online without the 2 VOI incentive fee.' },
						{
							code: 'below-range' as const,
							text: 'Balance below 30,000 VOI: no block rewards while outside this range.'
						}
					]
				})
			})
		);
		expect(html).toContain('Not registered for block rewards');
		expect(html).toContain('Online without the 2 VOI incentive fee.');
		expect(html).toContain('Balance below 30,000 VOI: no block rewards while outside this range.');
		expect(html.match(GO_ONLINE)?.length).toBe(2);
	});

	it('shows the contract text without a go-online link for it', () => {
		const html = card(
			drawBlock(
				{
					status: ready({
						registered: false,
						balance: 100_000_000_000,
						reasons: [{ code: 'contract' as const, text: CONTRACT_TEXT }]
					})
				},
				true
			)
		);
		expect(html.replace(/&#39;/g, "'")).toContain(CONTRACT_TEXT);
		expect(html.match(GO_ONLINE)).toBeNull();
	});

	it('shows the status alert when the status read fails', () => {
		const html = card(drawBlock({ status: { state: 'error', error: 'offline' } }));
		expect(html).toContain('Block reward registration status unavailable');
	});

	it('shows the paused banner only for paused funding', () => {
		const paused = card(drawBlock({ funding: ready({ funding: 'paused' as const, bonus: 5 }) }));
		expect(paused).toContain(PAUSED);
		expect(paused).toContain('Forecasts show rewards while funded.');
		const unknown = card(
			drawBlock({ funding: ready({ funding: 'unknown' as const, bonus: null }) })
		);
		expect(unknown).toContain('Block reward status unavailable');
		expect(unknown).not.toContain(PAUSED);
		const failed = card(drawBlock({ funding: { state: 'error', error: 'offline' } }));
		expect(failed).toContain('Block reward status unavailable');
		expect(failed).not.toContain(PAUSED);
		const funded = card(drawBlock());
		expect(funded).not.toContain(PAUSED);
		expect(funded).not.toContain('Block reward status unavailable');
		expect(funded).not.toContain('Forecasts show rewards while funded.');
	});

	it('alerts on indexing lag above 200 rounds only', () => {
		expect(card(drawBlock({ lastRound: ready(5_000_201) }))).toContain(
			'Block reward history is about 10 minutes behind the chain.'
		);
		expect(card(drawBlock({ lastRound: ready(5_000_200) }))).not.toContain('behind the chain');
	});

	it('shows forecasts for a registered account and Not registered otherwise', () => {
		const html = card(drawBlock());
		expect(tile(html, 'Chance of a block reward · next 24 hours')).toMatch(/\d+(\.\d+)?%/);
		expect(tile(html, 'Next 7 days')).toMatch(/\d+ block rewards \(\d+–\d+\), ≈ [\d.,]+ VOI/);
		expect(html).toContain('Assumes this balance and total online stake stay the same');
		const unregistered = card(
			drawBlock({
				status: ready({
					registered: false,
					balance: 100_000_000_000,
					reasons: [{ code: 'offline' as const, text: 'Account is offline.' }]
				})
			})
		);
		expect(tile(unregistered, 'Chance of a block reward · next 24 hours')).toContain(
			'Not registered'
		);
		expect(tile(unregistered, 'Next 7 days')).toContain('Not registered');
		expect(tile(unregistered, 'Next 7 days')).not.toContain('≈');
	});

	it('never shows a certain chance', () => {
		const html = card(
			drawBlock({
				status: ready({ registered: true, reasons: [], balance: 70_000_000_000_000 }),
				onlineStake: ready(100_000_000_000_000)
			})
		);
		const chance = tile(html, 'Chance of a block reward · next 24 hours');
		expect(chance).toContain('>99%');
		expect(chance).not.toContain('100%');
		expect(tile(html, 'Next 7 days')).toMatch(/\(\d{1,3}(,\d{3})+–\d{1,3}(,\d{3})+\)/);
	});

	it('shows forecast tiles unavailable when an input is missing', () => {
		const html = card(drawBlock({ onlineStake: { state: 'error', error: 'offline' } }));
		expect(html).toContain('Unable to load Next 7 days.');
	});

	it('marks partial rows and links each transaction to the explorer', () => {
		const html = card(drawBlock());
		expect(html).toContain('Recent block rewards');
		expect(html).toContain('Partial (fee sink low)');
		expect(html).toContain('href="https://block.voi.network/explorer/transaction/AB%2FC%2BD"');
		expect(html).toContain('(opens in a new tab)');
	});

	it('offers Load more only after a full page', () => {
		expect(card(drawBlock())).not.toContain('Load more');
		const full = Array.from({ length: BLOCK_REWARD_PAGE_SIZE }, (_, i) => reward(5_000_000 - i));
		const html = card(drawBlock({ recent: ready(full) }));
		expect(html).toMatch(/<button[^>]*>(?:<!---->|\s)*Load more/);
		expect(html).toContain(`See ${BLOCK_REWARD_PAGE_SIZE - 10} more block rewards`);
	});

	it('wires Load more to the pager with the merged rows', () => {
		const source = readFileSync(new URL('./WalletRewards.svelte', import.meta.url), 'utf8');
		expect(source).toMatch(/onclick=\{\(\) => void pager\.more\(recentRows\)\}/);
		expect(source).toMatch(
			/mergeBlockRewards\(blockSources\.recent\.value \?\? \[\], pages\.extra\)/
		);
	});

	it('uses no payout wording', () => {
		const html = card(drawBlock({ funding: ready({ funding: 'paused' as const, bonus: 5 }) }));
		const text = html.replace(/<[^>]+>/g, ' ');
		expect(text).not.toMatch(/payout/i);
		expect(
			card(drawBlock({ status: { state: 'error', error: 'x' } })).replace(/<[^>]+>/g, ' ')
		).not.toMatch(/payout/i);
	});

	it('draws expected bars only when the balance is in range', () => {
		const html = card(drawBlock());
		expect(html).toContain('Daily block rewards · last 30 days');
		expect(html).toContain('Above expected');
		expect(html).toContain('stroke-expected');
		const low = card(
			drawBlock({
				status: ready({ registered: false, balance: 1, reasons: [] })
			})
		);
		expect(low).not.toContain('Above expected');
		expect(low).not.toContain('stroke-expected');
	});
});
