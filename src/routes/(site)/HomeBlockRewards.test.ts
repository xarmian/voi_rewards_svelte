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
const flag = vi.hoisted(() => ({ testing: true }));
vi.mock('$lib/rewards/blockRewardLabels', async (original) => ({
	...(await original<typeof import('$lib/rewards/blockRewardLabels')>()),
	get REALTIME_BLOCK_REWARDS_TESTING() {
		return flag.testing;
	}
}));
vi.mock('$lib/home/blockRewards', async (original) => ({
	...(await original<typeof import('$lib/home/blockRewards')>()),
	createHomeBlockRewardsState: vi.fn()
}));
vi.mock('$lib/wallet/blockRewards', async (original) => ({
	...(await original<typeof import('$lib/wallet/blockRewards')>()),
	loadNetworkBlockRewardsDaily: vi.fn(),
	loadBlockRewardFunding: vi.fn()
}));
import { createHomeBlockRewardsState, type HomeBlockRewardsState } from '$lib/home/blockRewards';
import { loadBlockRewardFunding, loadNetworkBlockRewardsDaily } from '$lib/wallet/blockRewards';
import HomeBlockRewards from './HomeBlockRewards.svelte';

const ready = <T>(value: T) => ({ state: 'ready' as const, value, asOf: 1 });
const PAUSED =
	'Real-time block rewards are paused while they are in testing. Epoch rewards continue until testing is complete.';
const UNKNOWN = 'Real-time block reward status unavailable';
const SPARKLINE = 'Daily real-time block rewards, last 7 complete UTC days (VOI)';
const networkRows = (days = 30) =>
	Array.from({ length: days }, (_, i) => ({
		day: new Date(Date.parse('2026-11-16T00:00:00Z') - (days - 1 - i) * 86400000)
			.toISOString()
			.slice(0, 10),
		blocks: 30_000,
		rewardedBlocks: 1_234,
		amount: (i + 1) * 1_000_000,
		feesCollected: 3_000_000,
		lastRound: i === days - 1 ? 5_000_000 : null
	}));
function fixture(): HomeBlockRewardsState {
	return {
		network: ready(networkRows()),
		funding: ready({ funding: 'funded' as const, bonus: 5_000_000 })
	};
}
const draw = (state: Partial<HomeBlockRewardsState> = {}) => {
	vi.mocked(createHomeBlockRewardsState).mockReturnValue({ ...fixture(), ...state });
	return render(HomeBlockRewards).body;
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

beforeEach(() => {
	alerts.length = 0;
	flag.testing = true;
	vi.mocked(loadNetworkBlockRewardsDaily).mockClear();
	vi.mocked(loadBlockRewardFunding).mockClear();
});

describe('HomeBlockRewards', () => {
	it('server-renders the loading state without reading', () => {
		vi.mocked(createHomeBlockRewardsState).mockReturnValue({
			network: { state: 'loading' },
			funding: { state: 'loading' }
		});
		const html = render(HomeBlockRewards).body;
		expect(html.match(/<h2[^>]*>Real-time block rewards(?:<!---->)?<\/h2>/g)?.length).toBe(1);
		expect(html).toContain('aria-busy="true"');
		expect(html).toContain('Loading Today (UTC)…');
		expect(html).toContain('Loading Current bonus…');
		expect(html).toContain(`Loading ${SPARKLINE}…`);
		expect(html).toContain('Refresh real-time block rewards');
		expect(html).not.toContain('lg:col-span');
		expect(loadNetworkBlockRewardsDaily).not.toHaveBeenCalled();
		expect(loadBlockRewardFunding).not.toHaveBeenCalled();
	});

	it("shows today's network rewards, the current bonus and the 7-day trend", () => {
		const html = draw();
		expect(tile(html, 'Today (UTC)')).toMatch(
			/^Today \(UTC\) 30 VOI 1,234 of 30,000 blocks rewarded \(4\.1%\) /
		);
		expect(tile(html, 'Current bonus')).toMatch(/^Current bonus 5 VOI per block /);
		expect(html).toContain(`aria-label="${SPARKLINE}: from 23 to 29"`);
		expect(text(html)).toContain('Last 7 complete days (UTC)');
	});

	it('shows no share before the first block of the day', () => {
		const rows = networkRows();
		rows[rows.length - 1] = { ...rows[rows.length - 1], blocks: 0, rewardedBlocks: 0, amount: 0 };
		const today = tile(draw({ network: ready(rows) }), 'Today (UTC)');
		expect(today).toMatch(/^Today \(UTC\) 0 VOI No blocks yet today /);
		expect(today).not.toMatch(/NaN|%/);
	});

	it('shows the paused banner only for paused funding', () => {
		const paused = draw({ funding: ready({ funding: 'paused' as const, bonus: 5_000_000 }) });
		expect(paused).toContain(PAUSED);
		expect(paused).not.toContain(UNKNOWN);
		const unknown = draw({ funding: ready({ funding: 'unknown' as const, bonus: null }) });
		expect(unknown).toContain(UNKNOWN);
		expect(unknown).not.toContain(PAUSED);
		expect(alerts.find((a) => a.message === UNKNOWN)?.onretry).toBeTypeOf('function');
		const failed = draw({ funding: { state: 'error', error: 'offline' } });
		expect(failed).toContain(UNKNOWN);
		expect(failed).not.toContain(PAUSED);
		const funded = draw();
		expect(funded).not.toContain(PAUSED);
		expect(funded).not.toContain(UNKNOWN);
	});

	it('shows the network figures unavailable with a retry when the network read fails', () => {
		const html = draw({ network: { state: 'error', error: 'offline' } });
		for (const message of ['Unable to load Today (UTC).', `Unable to load ${SPARKLINE}.`]) {
			expect(html).toContain(message);
			expect(alerts.find((a) => a.message === message)?.onretry).toBeTypeOf('function');
		}
		expect(tile(html, 'Current bonus')).toMatch(/^Current bonus 5 VOI per block /);
	});

	it('shows the bonus unavailable with a retry when the bonus is missing or the read fails', () => {
		for (const funding of [
			ready({ funding: 'funded' as const, bonus: null }),
			{ state: 'error' as const, error: 'offline' }
		]) {
			alerts.length = 0;
			const html = draw({ funding });
			expect(html).toContain('Unable to load Current bonus.');
			expect(alerts.find((a) => a.message === 'Unable to load Current bonus.')?.onretry).toBeTypeOf(
				'function'
			);
			expect(tile(html, 'Today (UTC)')).toContain('30 VOI');
		}
	});

	it('uses no payout wording', () => {
		for (const html of [
			draw(),
			draw({ funding: ready({ funding: 'paused' as const, bonus: 5 }) }),
			draw({ funding: ready({ funding: 'unknown' as const, bonus: null }) }),
			draw({ network: { state: 'error', error: 'x' }, funding: { state: 'error', error: 'x' } })
		])
			expect(text(html)).not.toMatch(/payout/i);
	});
});

// Rendered "block reward" wording that neither names the real-time stream nor counts rewards.
const bareBlockRewards = (rendered: string) =>
	rendered
		.replace(/real-time block rewards?/gi, '')
		.replace(/<1 block reward\b/gi, '')
		.replace(/\d[\d,]*\s+block rewards?\b/gi, '')
		.match(/block reward/gi) ?? [];

describe('HomeBlockRewards real-time labelling', () => {
	it('titles the card Real-time block rewards with a Testing badge', () => {
		const html = draw();
		expect(html.match(/<h2[^>]*>Real-time block rewards(?:<!---->)?<\/h2>/g)?.length).toBe(1);
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
			draw({ funding: ready({ funding: 'paused' as const, bonus: 5 }) }),
			draw({ funding: ready({ funding: 'unknown' as const, bonus: null }) }),
			draw({ network: { state: 'error', error: 'x' }, funding: { state: 'error', error: 'x' } })
		])
			expect(bareBlockRewards(text(html))).toEqual([]);
	});
});
