import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
const alerts = vi.hoisted(() => [] as { message: string; onretry?: () => void }[]);
vi.mock('../InlineAlert/InlineAlert.svelte', async (original) => {
	const real = (await original<typeof import('../InlineAlert/InlineAlert.svelte')>()).default;
	return {
		default: (...args: Parameters<typeof real>) => {
			alerts.push(args[1] as (typeof alerts)[number]);
			return real(...args);
		}
	};
});
const flag = vi.hoisted(() => ({ testing: true }));
vi.mock('$lib/rewards/blockRewardLabels', async (original) => ({
	...(await original<typeof import('$lib/rewards/blockRewardLabels')>()),
	get REALTIME_BLOCK_REWARDS_TESTING() {
		return flag.testing;
	}
}));
vi.mock('$lib/wallet/blockRewardsCard', async (original) => ({
	...(await original<typeof import('$lib/wallet/blockRewardsCard')>()),
	createBlockRewardsState: vi.fn()
}));
import { createBlockRewardsState, type BlockRewardsState } from '$lib/wallet/blockRewardsCard';
import { BLOCK_REWARD_STATUS_TEXT, type BlockRewardReason } from '$lib/rewards/blockRewardStatus';
import WalletBlockRewards from './WalletBlockRewards.svelte';

const ready = <T>(value: T) => ({ state: 'ready' as const, value, asOf: 1 });
const PAUSED =
	'Real-time block rewards are paused while they are in testing. Epoch rewards continue until testing is complete.';
const UNKNOWN_REGISTRATION = 'Real-time block reward registration status unavailable';
const networkRows = (days = 8, end = '2026-11-07') =>
	Array.from({ length: days }, (_, i) => ({
		day: new Date(Date.parse(`${end}T00:00:00Z`) - (days - 1 - i) * 86400000)
			.toISOString()
			.slice(0, 10),
		blocks: 30_000,
		rewardedBlocks: 30_000,
		amount: 0,
		feesCollected: 3_000_000,
		lastRound: i === days - 1 ? 5_000_000 : null
	}));
function fixture(): BlockRewardsState {
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
		network: { ...ready(networkRows()), asOf: Date.parse('2026-11-07T11:59:00Z') },
		onlineStake: ready(1_000_000_000_000_000),
		lastRound: ready(5_000_100),
		recent: { state: 'loading' }
	};
}
type Props = {
	isContract?: boolean;
	ownerLookup?: 'ok' | 'unavailable';
	onretrylookup?: () => void;
};
const draw = (state: Partial<BlockRewardsState> = {}, props: Props = {}) => {
	vi.mocked(createBlockRewardsState).mockReturnValue({ ...fixture(), ...state });
	return render(WalletBlockRewards, {
		props: { pageAddress: 'Y', now: new Date('2026-11-07T12:00:00Z'), ...props }
	}).body;
};
const text = (html: string) =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ');
const tile = (html: string, label: string) => {
	const clean = html.replace(/<!--[\s\S]*?-->/g, '');
	const start = clean.indexOf(`>${label}</div>`);
	expect(start, label).toBeGreaterThan(0);
	return text(clean.slice(start + 1, start + 1500));
};
const unregistered = (codes: BlockRewardReason[], balance = 100_000_000_000) =>
	ready({
		registered: false,
		balance,
		reasons: codes.map((code) => ({ code, text: BLOCK_REWARD_STATUS_TEXT[code] }))
	});

beforeEach(() => {
	alerts.length = 0;
	flag.testing = true;
});
// Rendered "block reward" wording that neither names the real-time stream nor counts rewards.
const bareBlockRewards = (rendered: string) =>
	rendered
		.replace(/real-time block rewards?/gi, '')
		.replace(/<1 block reward\b/gi, '')
		.replace(/\d[\d,]*\s+block rewards?\b/gi, '')
		.match(/block reward/gi) ?? [];

describe('WalletBlockRewards real-time labelling', () => {
	it('titles the card Real-time block rewards with a Testing badge', () => {
		const html = draw();
		expect(html.match(/<h2[^>]*>Real-time block rewards(?:<!---->)?<\/h2>/g)?.length).toBe(1);
		expect(html).toContain('id="ds-card-real-time-block-rewards"');
		expect(text(html)).toMatch(/Real-time block rewards ◆ Testing Refresh real-time block rewards/);
	});

	it('drops the Testing badge when testing is switched off', () => {
		flag.testing = false;
		const html = text(draw());
		expect(html).toContain('Real-time block rewards');
		expect(html).not.toContain('Testing');
	});

	it('names every block reward as real-time, apart from counts', () => {
		for (const html of [
			draw(),
			draw({ lastRound: ready(5_000_201) }),
			draw({ funding: ready({ funding: 'paused' as const, bonus: 5 }) }),
			draw({ funding: ready({ funding: 'unknown' as const, bonus: null }) }),
			draw({ status: unregistered(['not-opted-in', 'below-range', 'above-range'], 1) }),
			draw({ status: unregistered(['contract']) }, { isContract: true }),
			draw({ status: { state: 'error', error: 'x' } }),
			draw({ onlineStake: { state: 'error', error: 'x' } }),
			draw({ status: { state: 'loading' } })
		])
			expect(bareBlockRewards(text(html))).toEqual([]);
	});
});

describe('WalletBlockRewards', () => {
	it('renders one Block rewards card with a refresh control', () => {
		const html = draw();
		expect(html.match(/<h2[^>]*>Real-time block rewards(?:<!---->)?<\/h2>/g)?.length).toBe(1);
		expect(html).toContain('lg:col-span-12');
		expect(html).toContain('md:col-span-2');
		expect(html).toContain('Refresh real-time block rewards');
	});

	it('shows today and 7-day totals and counts from the daily rows', () => {
		const html = draw();
		expect(tile(html, 'Today (UTC)')).toMatch(/^Today \(UTC\) 2 VOI 1 block reward /);
		expect(tile(html, 'Last 7 days')).toMatch(/^Last 7 days 6 VOI 4 block rewards /);
		expect(html).not.toContain('Last 30 days');
	});

	it('shows the history tiles unavailable with a retry when the daily read fails', () => {
		const html = draw({ daily: { state: 'error', error: 'offline' } });
		expect(html).toContain('Unable to load Today (UTC).');
		expect(html).toContain('Unable to load Last 7 days.');
		expect(alerts.find((a) => a.message === 'Unable to load Today (UTC).')?.onretry).toBeTypeOf(
			'function'
		);
	});

	it('shows the registered pill and no go-online link', () => {
		const html = draw();
		expect(html).toContain('Registered for real-time block rewards');
		expect(html).not.toContain('Not registered for real-time block rewards');
		expect(html).not.toMatch(/Go online/);
	});

	it('lists every reason for an unregistered account, with no go-online link', () => {
		const html = text(draw({ status: unregistered(['not-opted-in', 'below-range'], 1) }));
		expect(html).toContain('Not registered for real-time block rewards');
		expect(html).toContain('Online without the 2 VOI incentive fee.');
		expect(html).toContain(
			'Balance below 30,000 VOI: no real-time block rewards while outside this range.'
		);
		expect(html).not.toMatch(/Go online/);
	});

	it('shows the contract reason on a contract page, with no go-online link', () => {
		const html = text(
			draw({ status: unregistered(['contract', 'not-opted-in']) }, { isContract: true })
		);
		expect(html).toContain(BLOCK_REWARD_STATUS_TEXT.contract);
		expect(html).toContain('Online without the 2 VOI incentive fee.');
		expect(html).not.toMatch(/Go online/);
	});

	it('shows the status alert with a retry when the status read fails', () => {
		const html = draw({ status: { state: 'error', error: 'offline' } });
		expect(html).toContain(UNKNOWN_REGISTRATION);
		expect(alerts.find((a) => a.message === UNKNOWN_REGISTRATION)?.onretry).toBeTypeOf('function');
	});

	it('shows the paused banner only for paused funding', () => {
		const paused = draw({ funding: ready({ funding: 'paused' as const, bonus: 5 }) });
		expect(paused).toContain(PAUSED);
		expect(paused).toContain('Forecast shows rewards while funded.');
		const unknown = draw({ funding: ready({ funding: 'unknown' as const, bonus: null }) });
		expect(unknown).toContain('Real-time block reward status unavailable');
		expect(unknown).not.toContain(PAUSED);
		const failed = draw({ funding: { state: 'error', error: 'offline' } });
		expect(failed).toContain('Real-time block reward status unavailable');
		expect(failed).not.toContain(PAUSED);
		const funded = draw();
		expect(funded).not.toContain(PAUSED);
		expect(funded).not.toContain('Real-time block reward status unavailable');
		expect(funded).not.toContain('Forecast shows rewards while funded.');
	});

	it('shows the chance for a registered account, never a certain one, and Not registered otherwise', () => {
		const label = 'Chance of a real-time block reward · next 24 hours';
		expect(tile(draw(), label)).toMatch(/\d+(\.\d+)?%/);
		const certain = tile(
			draw({
				status: ready({ registered: true, reasons: [], balance: 70_000_000_000_000 }),
				onlineStake: ready(100_000_000_000_000)
			}),
			label
		);
		expect(certain).toContain('>99%');
		expect(certain).not.toContain('100%');
		const notRegistered = tile(draw({ status: unregistered(['offline']) }), label);
		expect(notRegistered).toContain('Not registered');
		expect(notRegistered).not.toMatch(/\d%/);
	});

	it('shows the chance unavailable with a retry when an input is missing', () => {
		const html = draw({ onlineStake: { state: 'error', error: 'offline' } });
		const message = 'Unable to load Chance of a real-time block reward · next 24 hours.';
		expect(text(html)).toContain(message);
		expect(alerts.find((a) => a.message === message)?.onretry).toBeTypeOf('function');
	});

	it('shows registration status unavailable when the page cannot tell whether it is a contract', () => {
		const onretrylookup = vi.fn();
		const html = draw(
			{ status: unregistered(['offline']) },
			{ ownerLookup: 'unavailable', onretrylookup }
		);
		expect(html).toContain(UNKNOWN_REGISTRATION);
		expect(html).not.toContain('Not registered');
		expect(html).not.toContain('Account is offline.');
		expect(html).toContain('Unable to load Chance of a real-time block reward · next 24 hours.');
		const lookups = alerts.filter((a) => a.onretry === onretrylookup);
		expect(lookups.map((a) => a.message)).toEqual([
			UNKNOWN_REGISTRATION,
			'Unable to load Chance of a real-time block reward · next 24 hours.'
		]);
		lookups[0].onretry!();
		expect(onretrylookup).toHaveBeenCalledTimes(1);
		const registered = draw({}, { ownerLookup: 'unavailable', onretrylookup });
		expect(registered).toContain(UNKNOWN_REGISTRATION);
		expect(registered).not.toContain('Registered for real-time block rewards');
	});

	it('keeps showing the contract status on a contract page when the owner lookup failed', () => {
		const html = text(
			draw({ status: unregistered(['contract']) }, { isContract: true, ownerLookup: 'unavailable' })
		);
		expect(html).toContain('Not registered for real-time block rewards');
		expect(html).toContain(BLOCK_REWARD_STATUS_TEXT.contract);
		expect(html).not.toContain(UNKNOWN_REGISTRATION);
	});

	it('does not show a status read for the other contract classification', () => {
		const stale = {
			state: 'stale' as const,
			value: { registered: true, reasons: [], balance: 100_000_000_000 },
			asOf: 1
		};
		const reloading = draw({ status: stale }, { isContract: true });
		expect(text(reloading)).not.toContain('Registered for real-time block rewards');
		expect(text(reloading)).toContain('Loading real-time block reward registration status');
		expect(tile(reloading, 'Chance of a real-time block reward · next 24 hours')).not.toMatch(/%/);
		expect(reloading).not.toContain('Unable to load Chance');
		const failed = draw({ status: { ...stale, error: 'down' } }, { isContract: true });
		expect(text(failed)).not.toContain('Registered for real-time block rewards');
		expect(text(failed)).toContain('Real-time block reward registration status unavailable');
	});

	it('links to the rewards tab for details', () => {
		const link = draw().match(/<a[^>]*href="#rewards"[^>]*>([\s\S]*?)<\/a>/);
		expect(link?.[1].replace(/<[^>]+>/g, '')).toBe('Details on real-time block rewards →');
	});

	it('uses no payout wording', () => {
		for (const html of [
			draw(),
			draw({ funding: ready({ funding: 'paused' as const, bonus: 5 }) }),
			draw({ status: { state: 'error', error: 'x' } }),
			draw({}, { ownerLookup: 'unavailable' })
		])
			expect(text(html)).not.toMatch(/payout/i);
	});

	it('alerts on indexing lag above 200 rounds only', () => {
		expect(draw({ lastRound: ready(5_000_201) })).toContain(
			'Real-time block reward history is about 10 minutes behind the chain.'
		);
		expect(draw({ lastRound: ready(5_000_200) })).not.toContain('behind the chain');
	});

	it('server-renders loading footprints without reading', () => {
		vi.mocked(createBlockRewardsState).mockReturnValue(
			Object.fromEntries(
				Object.keys(fixture()).map((key) => [key, { state: 'loading' }])
			) as BlockRewardsState
		);
		const html = render(WalletBlockRewards, { props: { pageAddress: 'Y' } }).body;
		expect(html).toContain('aria-busy="true"');
		expect(html).toContain('Loading real-time block reward registration status…');
		expect(html).toContain('Loading Today (UTC)…');
	});
});
