import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
const alerts = vi.hoisted(() => [] as { message: string; onretry?: () => void }[]);
vi.mock('$lib/ds/InlineAlert/InlineAlert.svelte', async (original) => {
	const real = (await original<typeof import('$lib/ds/InlineAlert/InlineAlert.svelte')>()).default;
	return {
		default: (...args: Parameters<typeof real>) => {
			alerts.push(args[1] as (typeof alerts)[number]);
			return real(...args);
		}
	};
});
vi.mock('./calculatorBlockRewards', async (original) => ({
	...(await original<typeof import('./calculatorBlockRewards')>()),
	createCalculatorBlockRewardsState: vi.fn()
}));
vi.mock('$lib/wallet/blockRewards', async (original) => ({
	...(await original<typeof import('$lib/wallet/blockRewards')>()),
	loadNetworkBlockRewardsDaily: vi.fn(),
	loadBlockRewardFunding: vi.fn()
}));
vi.mock('$lib/rewards/blockRewardChain', async (original) => ({
	...(await original<typeof import('$lib/rewards/blockRewardChain')>()),
	readOnlineStake: vi.fn(),
	readLastRound: vi.fn()
}));
import {
	createCalculatorBlockRewardsState,
	type CalculatorBlockRewardsState
} from './calculatorBlockRewards';
import { loadBlockRewardFunding, loadNetworkBlockRewardsDaily } from '$lib/wallet/blockRewards';
import { readLastRound, readOnlineStake } from '$lib/rewards/blockRewardChain';
import { BLOCK_REWARDS_PAUSED_TEXT } from '$lib/rewards/blockRewardStatus';
import { FORECAST_ASSUMPTIONS } from '$lib/rewards/blockRewardForecast';
import CalculatorBlockRewards from './CalculatorBlockRewards.svelte';

const AS_OF = Date.parse('2026-11-16T12:00:00Z');
const ready = <T>(value: T) => ({ state: 'ready' as const, value, asOf: AS_OF });
const OUT_OF_RANGE = 'No real-time block rewards: stake must be between 30,000 and 70,000,000 VOI.';
const FEE_NOTE =
	'Requires going online with the 2 VOI incentive fee. Staking contracts cannot pay it.';
const ERROR = 'Real-time block reward estimates are unavailable.';
const TILES = [
	'Daily',
	'Monthly',
	'Yearly',
	'Chance of a real-time block reward · next 24 hours',
	'Chance of a real-time block reward · next 7 days'
];

function networkRows() {
	const today = Date.parse('2026-11-16T00:00:00Z');
	return Array.from({ length: 30 }, (_, i) => ({
		day: new Date(today - (29 - i) * 86400000).toISOString().slice(0, 10),
		blocks: 31_191,
		rewardedBlocks: 31_191,
		amount: 0,
		feesCollected: 0,
		lastRound: i === 29 ? 5_000_000 : null
	}));
}
function fixture(): CalculatorBlockRewardsState {
	return {
		funding: ready({ funding: 'funded' as const, bonus: 5_000_000 }),
		network: ready(networkRows()),
		onlineStake: ready(739_560_000 * 1e6),
		lastRound: ready(5_000_000)
	};
}
const draw = (
	props: { stake: number | null; price: number | null } = { stake: 30_000, price: 0.01 },
	state: Partial<CalculatorBlockRewardsState> = {}
) => {
	vi.mocked(createCalculatorBlockRewardsState).mockReturnValue({ ...fixture(), ...state });
	return render(CalculatorBlockRewards, { props }).body;
};
const text = (html: string) =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ');
const tile = (html: string, label: string) => {
	const clean = html.replace(/<!--[\s\S]*?-->/g, '');
	const start = clean.indexOf(`>${label}</div>`);
	expect(start, label).toBeGreaterThan(0);
	const next = clean.indexOf('rounded-card border', start);
	return text(clean.slice(start + 1, next < 0 ? undefined : next));
};

beforeEach(() => {
	alerts.length = 0;
	for (const loader of [
		loadNetworkBlockRewardsDaily,
		loadBlockRewardFunding,
		readOnlineStake,
		readLastRound
	])
		vi.mocked(loader).mockClear();
});

describe('CalculatorBlockRewards', () => {
	it('server-renders the heading, the Testing badge and the loading state without reading', () => {
		vi.mocked(createCalculatorBlockRewardsState).mockReturnValue({
			funding: { state: 'loading' },
			network: { state: 'loading' },
			onlineStake: { state: 'loading' },
			lastRound: { state: 'loading' }
		});
		const html = render(CalculatorBlockRewards, { props: { stake: 30_000, price: 0.01 } }).body;
		expect(html).toContain('aria-labelledby="estimated-block-rewards-heading"');
		expect(
			html.match(
				/<h2 id="estimated-block-rewards-heading" class="text-h2">Estimated real-time block rewards(?:<!---->)?<\/h2>/g
			)?.length
		).toBe(1);
		expect(text(html)).toContain('Testing');
		expect(html).toContain('aria-busy="true"');
		for (const label of TILES) expect(html).toContain(`Loading ${label}…`);
		expect(loadNetworkBlockRewardsDaily).not.toHaveBeenCalled();
		expect(loadBlockRewardFunding).not.toHaveBeenCalled();
		expect(readOnlineStake).not.toHaveBeenCalled();
		expect(readLastRound).not.toHaveBeenCalled();
	});

	it('shows VOI and USD forecasts, both chances, the rate line and the footnotes', () => {
		const html = draw();
		expect(tile(html, 'Daily')).toMatch(/^Daily \d[\d.,]* VOI \$\d/);
		expect(tile(html, 'Monthly')).toMatch(/^Monthly \d[\d.,]* VOI \$\d/);
		expect(tile(html, 'Yearly')).toMatch(/^Yearly \d[\d.,]*k? VOI \$\d/);
		expect(tile(html, 'Chance of a real-time block reward · next 24 hours')).toMatch(/ 7[12]% /);
		expect(tile(html, 'Chance of a real-time block reward · next 7 days')).toMatch(
			/ >99% \d+ block rewards \(\d+–\d+\), ≈ [\d.,]+ VOI /
		);
		const all = text(html);
		expect(all).toMatch(/≈ \d+\.\d{2}% a year while funded/);
		expect(all).toContain(FORECAST_ASSUMPTIONS);
		expect(all).toContain(FEE_NOTE);
		expect(all).not.toContain(OUT_OF_RANGE);
		expect(all).not.toContain(BLOCK_REWARDS_PAUSED_TEXT);
		expect(all).not.toMatch(/NaN|Infinity/);
	});

	it('shows VOI without USD when there is no price', () => {
		const html = draw({ stake: 30_000, price: null });
		for (const label of ['Daily', 'Monthly', 'Yearly']) {
			expect(tile(html, label)).toMatch(new RegExp(`^${label} \\d[\\d.,]*k? VOI `));
			expect(tile(html, label)).toContain('Unavailable without a price');
			expect(tile(html, label)).not.toContain('$');
		}
	});

	it('shows the out-of-range sentence and no tiles for a stake outside the bounds', () => {
		for (const stake of [29_999, 70_000_001]) {
			const html = draw({ stake, price: 0.01 });
			expect(text(html)).toContain(OUT_OF_RANGE);
			for (const label of TILES) expect(html).not.toContain(`>${label}</div>`);
			expect(text(html)).not.toContain('a year while funded');
			expect(alerts).toEqual([]);
		}
	});

	it('shows the tiles unavailable for an invalid stake, with no alert', () => {
		const html = draw({ stake: null, price: 0.01 });
		for (const label of ['Daily', 'Monthly', 'Yearly'])
			expect(tile(html, label)).toContain('Unavailable');
		expect(alerts).toEqual([]);
		expect(text(html)).not.toContain(OUT_OF_RANGE);
		expect(text(html)).not.toContain('a year while funded');
	});

	it('shows the paused banner only for paused funding', () => {
		const paused = draw(undefined, {
			funding: ready({ funding: 'paused' as const, bonus: 5_000_000 })
		});
		expect(paused).toContain(BLOCK_REWARDS_PAUSED_TEXT);
		const unknown = draw(undefined, {
			funding: ready({ funding: 'unknown' as const, bonus: 5_000_000 })
		});
		expect(unknown).not.toContain(BLOCK_REWARDS_PAUSED_TEXT);
		expect(draw()).not.toContain(BLOCK_REWARDS_PAUSED_TEXT);
	});

	it('shows an alert with a retry when a read fails', () => {
		const html = draw(undefined, { onlineStake: { state: 'error', error: 'offline' } });
		expect(text(html)).toContain(ERROR);
		expect(alerts.find((a) => a.message === ERROR)?.onretry).toBeTypeOf('function');
		expect(html).toContain('>Retry<');
	});

	it('uses no payout, profit, APR or APY wording', () => {
		for (const html of [
			draw(),
			draw({ stake: 30_000, price: null }),
			draw({ stake: 10, price: 0.01 }),
			draw({ stake: null, price: null }),
			draw(undefined, { funding: ready({ funding: 'paused' as const, bonus: 5_000_000 }) }),
			draw(undefined, { network: { state: 'error', error: 'x' } })
		]) {
			const all = text(html);
			expect(all).not.toMatch(/payout/i);
			expect(all).not.toMatch(/profit/i);
			expect(all).not.toMatch(/\bAPR\b/);
			expect(all).not.toMatch(/\bAPY\b/);
		}
	});
});
