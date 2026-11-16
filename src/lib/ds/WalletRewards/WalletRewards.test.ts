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
import { BLOCK_REWARD_STATUS_TEXT, type BlockRewardReason } from '$lib/rewards/blockRewardStatus';
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
const networkRows = (days = 8, end = '2026-11-07') =>
	Array.from({ length: days }, (_, i) => {
		const day = new Date(Date.parse(`${end}T00:00:00Z`) - (days - 1 - i) * 86400000)
			.toISOString()
			.slice(0, 10);
		return networkDay(day, i === days - 1 ? 5_000_000 : null);
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
		network: {
			...ready(networkRows()),
			asOf: Date.parse('2026-11-07T11:59:00Z')
		},
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
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
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

	const unregistered = (codes: BlockRewardReason[], balance = 100_000_000_000) =>
		ready({
			registered: false,
			balance,
			reasons: codes.map((code) => ({ code, text: BLOCK_REWARD_STATUS_TEXT[code] }))
		});

	it('lists every reason and one go-online link when a reason can be fixed by going online', () => {
		const html = card(drawBlock({ status: unregistered(['not-opted-in', 'below-range'], 1) }));
		expect(html).toContain('Not registered for block rewards');
		expect(html).toContain('Online without the 2 VOI incentive fee.');
		expect(html).toContain('Balance below 30,000 VOI: no block rewards while outside this range.');
		expect(html.match(GO_ONLINE)?.length).toBe(1);
		const twoFixable = card(drawBlock({ status: unregistered(['not-opted-in', 'keys-expired']) }));
		expect(twoFixable).toContain('Participation keys expired.');
		expect(twoFixable.match(GO_ONLINE)?.length).toBe(1);
		const link = twoFixable.indexOf('Go online with the 2 VOI incentive fee');
		expect(link).toBeGreaterThan(twoFixable.indexOf('</ul>'));
		for (const code of ['suspended', 'offline'] as const)
			expect(card(drawBlock({ status: unregistered([code]) })).match(GO_ONLINE)?.length, code).toBe(
				1
			);
	});

	it('offers no go-online link for balance range reasons alone', () => {
		expect(
			card(drawBlock({ status: unregistered(['below-range'], 1) })).match(GO_ONLINE)
		).toBeNull();
		expect(
			card(drawBlock({ status: unregistered(['above-range'], 80_000_000_000_000) })).match(
				GO_ONLINE
			)
		).toBeNull();
	});

	it('shows the contract text and never a go-online link on a contract page', () => {
		const html = card(drawBlock({ status: unregistered(['contract', 'not-opted-in']) }, true));
		expect(html.replace(/&#39;/g, "'")).toContain(CONTRACT_TEXT);
		expect(html).toContain('Online without the 2 VOI incentive fee.');
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

	it('keeps forecasting after the clock passes UTC midnight', () => {
		vi.mocked(createBlockRewardsState).mockReturnValue({
			...blockFixture(),
			network: { ...ready(networkRows()), asOf: Date.parse('2026-11-07T23:59:50Z') }
		});
		const html = card(
			render(WalletRewards, {
				props: { pageAddress: 'Y', now: new Date('2026-11-08T00:00:40Z') }
			}).body
		);
		expect(tile(html, 'Chance of a block reward · next 24 hours')).toMatch(/\d+(\.\d+)?%/);
		expect(tile(html, 'Next 7 days')).toContain('≈');
		expect(html).not.toContain('Unable to load Next 7 days.');
	});

	it('says under one block reward when fewer than one is expected', () => {
		const html = card(
			drawBlock({
				status: ready({ registered: true, reasons: [], balance: 30_000_000_000 }),
				onlineStake: ready(20_000_000_000_000_000)
			})
		);
		expect(tile(html, 'Next 7 days')).toMatch(/<1 block reward \(0–1\), ≈ [\d.,]+ VOI/);
		expect(tile(html, 'Next 7 days')).not.toContain('0 block rewards');
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

	const rows = (count: number) => Array.from({ length: count }, (_, i) => reward(5_000_000 - i));
	const shownRows = (html: string) => html.match(/\/explorer\/transaction\//g)?.length ?? 0;
	const SHOW_MORE = /<button[^>]*>(?:<!---->|\s)*Show more block rewards/;

	it('shows ten rows and one control to show more after a full page', () => {
		const html = card(drawBlock({ recent: ready(rows(BLOCK_REWARD_PAGE_SIZE)) }));
		expect(shownRows(html)).toBe(10);
		expect(html).toMatch(SHOW_MORE);
		expect(html.match(/Show more block rewards/g)?.length).toBe(1);
		expect(html).not.toMatch(/See \d+ more block rewards|Load more/);
		// The live count speaks only after the user asks for more rows.
		expect(html).not.toContain('Showing 10 of 100 loaded block rewards');
		expect(html).toMatch(/<p class="sr-only" aria-live="polite">/);
	});

	it('offers the control for hidden rows even after a short page', () => {
		const html = card(drawBlock({ recent: ready(rows(12)) }));
		expect(shownRows(html)).toBe(10);
		expect(html).toMatch(SHOW_MORE);
	});

	it('offers no control when every row is shown and the page was short', () => {
		for (const count of [2, 10]) {
			const html = card(drawBlock({ recent: ready(rows(count)) }));
			expect(shownRows(html), String(count)).toBe(count);
			expect(html, String(count)).not.toContain('Show more block rewards');
		}
	});

	it('still reveals loaded rows while the first page is refreshing or after it failed to refresh', () => {
		const html = card(
			drawBlock({
				recent: {
					state: 'stale',
					value: rows(BLOCK_REWARD_PAGE_SIZE),
					asOf: 1,
					error: 'Request timed out after 15 seconds'
				}
			})
		);
		expect(shownRows(html)).toBe(10);
		expect(html).toMatch(SHOW_MORE);
	});

	it('says when recent block rewards failed to refresh, so the loaded rows do not read as the full history', () => {
		const failed = card(
			drawBlock({
				recent: {
					state: 'stale',
					value: rows(BLOCK_REWARD_PAGE_SIZE),
					asOf: 1,
					error: 'Request timed out after 15 seconds'
				}
			})
		);
		expect(failed).toContain(
			'Recent block rewards did not refresh. Older block rewards load after a successful refresh.'
		);
		const refreshing = card(
			drawBlock({ recent: { state: 'stale', value: rows(BLOCK_REWARD_PAGE_SIZE), asOf: 1 } })
		);
		expect(refreshing).not.toContain('Recent block rewards did not refresh');
		expect(card(drawBlock())).not.toContain('Recent block rewards did not refresh');
	});

	it('marks the end of the history in the live count', () => {
		const source = readFileSync(new URL('./WalletRewards.svelte', import.meta.url), 'utf8');
		expect(source).toMatch(/; no older\s+block\s+rewards/);
	});

	it('keeps the control through a paging error so pressing it again retries', () => {
		const source = readFileSync(new URL('./WalletRewards.svelte', import.meta.url), 'utf8');
		const start = source.indexOf("{#if pages.state === 'error'}");
		const alert = source.slice(start, source.indexOf('{/if}', start));
		expect(alert).toContain('Older block rewards unavailable');
		expect(alert).not.toMatch(/onretry=/);
		expect(source).not.toMatch(/pages\.state !== 'error' &&/);
	});

	it('wires the control to one handler that never disables it', () => {
		const source = readFileSync(new URL('./WalletRewards.svelte', import.meta.url), 'utf8');
		const button = source.slice(source.indexOf("'Show more block rewards'") - 600);
		expect(button.slice(0, 600)).toMatch(/onclick=\{\(\) => void showMoreRewards\(\)\}/);
		expect(button.slice(0, 600)).toMatch(/aria-busy=/);
		expect(button.slice(0, 600)).not.toMatch(/disabled=/);
		expect(source).toContain('Loading older block rewards…');
		expect(source).toMatch(/void pager\.more\(recentRows\)|await pager\.more\(recentRows\)/);
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

	const legend = (html: string) => {
		const start = html.indexOf('legend"');
		return start < 0 ? '' : html.slice(start, html.indexOf('</ul>', start));
	};

	it('draws expected bars only for a registered account with a balance in range', () => {
		const html = card(drawBlock());
		expect(html).toContain('Daily block rewards · last 30 days');
		expect(legend(html)).toContain('Expected at current balance');
		expect(html).toContain('stroke-expected');
		const cases = {
			'unregistered in range': drawBlock({ status: unregistered(['offline']) }),
			'contract page': drawBlock(
				{ status: ready({ registered: true, reasons: [], balance: 100_000_000_000 }) },
				true
			),
			'below range': drawBlock({ status: unregistered(['below-range'], 1) })
		};
		for (const [name, page] of Object.entries(cases)) {
			const body = card(page);
			expect(legend(body), name).toContain('Block rewards');
			expect(legend(body), name).not.toContain('Expected at current balance');
			expect(body, name).not.toContain('stroke-expected');
		}
	});
});
