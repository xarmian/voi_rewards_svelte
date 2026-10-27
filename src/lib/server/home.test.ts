import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { load } from '../../routes/(site)/+page.server';
import { config } from '$lib/config';
import type { HomeData } from './home';
const now = new Date('2026-10-25T02:38:00Z');
const rows = {
	data: [{ proposer: 'wallet', block_count: 126874 }],
	num_blocks: 126874,
	num_blocks_ballast: 0,
	blacklist: [],
	max_timestamp: now.toISOString()
};
function body(url: string) {
	if (url.includes('/api/markets'))
		return {
			aggregates: { weightedAveragePrice: 0.000127 },
			marketData: [{ price_change_percentage_24h: -1.01, market_cap: 265986 }]
		};
	if (url.includes('/api/mimir')) return { data: 152 };
	if (url.includes('/api/epochs'))
		return {
			epochs: [103, 104].map((epoch_number) => ({
				epoch_number,
				apr: 16.04,
				eligible_online_stake: 725200000,
				participating_wallets: 97
			}))
		};
	if (url.includes('online-stake-history'))
		return [{ date: '2026-10-25', avg_online_stake: 725200000e6 }];
	if (url.includes('?start')) return rows;
	return { max_timestamp: now.toISOString() };
}
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const run = (host = 'voirewards.com') => load({ fetch: fetcher, url: new URL(`https://${host}/`) });
function dashboard(data: HomeData) {
	if (data.page !== 'dashboard') throw new Error('Expected dashboard');
	return data;
}
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(now);
	fetcher = vi.fn<typeof fetch>(async (input) => Response.json(body(String(input))));
	vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
it.each(['/api/markets', '/api/mimir'])(
	'rewards never wait for %s; its deadline resolves to error',
	async (slow) => {
		fetcher.mockImplementation(async (input) =>
			String(input).includes(slow) ? new Promise(() => {}) : Response.json(body(String(input)))
		);
		const result = dashboard(await run());
		expect(result.chrome).toBe('hero');
		expect(result.headline.state).toBe('ready');
		expect(result.rewards.state).toBe('ready');
		const streamed = slow === '/api/markets' ? result.price : result.onlineCount;
		const settled = vi.fn();
		void streamed.then(settled);
		await vi.advanceTimersByTimeAsync(4000);
		expect(settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1100);
		expect(await streamed).toMatchObject({ state: 'error' });
	}
);
it.each([0, null, NaN])('rejects invalid price and online count %s', async (value) => {
	fetcher.mockImplementation(async (input) =>
		Response.json(
			String(input).includes('/api/mimir')
				? { data: value }
				: String(input).includes('/api/markets')
					? { aggregates: { weightedAveragePrice: value } }
					: body(String(input))
		)
	);
	const result = dashboard(await run());
	expect((await result.onlineCount).state).toBe('error');
	expect((await result.price).state).toBe('error');
});
it.each(['failure', 'timeout'])('isolates base date-range %s from both charts', async (mode) => {
	fetcher.mockImplementation(async (input) =>
		String(input) === config.proposalApiBaseUrl
			? mode === 'timeout'
				? new Promise(() => {})
				: new Response(null, { status: 503 })
			: Response.json(body(String(input)))
	);
	const pending = run();
	await vi.advanceTimersByTimeAsync(4100);
	const result = dashboard(await pending);
	expect(result.headline.state).toBe('error');
	expect(result.rewards.state).toBe('error');
	expect(result.aprHistory.state).toBe('ready');
	expect(result.onlineStake.state).toBe('ready');
});
it('bounds an entirely unresponsive proposers API', async () => {
	fetcher.mockImplementation(async (input) =>
		String(input).startsWith(config.proposalApiBaseUrl)
			? new Promise(() => {})
			: Response.json(body(String(input)))
	);
	const pending = run();
	await vi.advanceTimersByTimeAsync(4100);
	const result = dashboard(await pending);
	expect(result.headline.state).toBe('error');
	expect(result.rewards.state).toBe('error');
	expect(result.aprHistory.state).toBe('ready');
	expect(result.onlineStake.state).toBe('error');
});
it('refetches rows once for a lagging previous epoch', async () => {
	fetcher.mockImplementation(async (input) =>
		Response.json(
			String(input) === config.proposalApiBaseUrl
				? { max_timestamp: '2026-10-20T23:59:00Z' }
				: body(String(input))
		)
	);
	const result = dashboard(await run());
	expect(result.headline).toMatchObject({
		state: 'ready',
		value: { epoch: 103, rangeId: '20261014-20261020' }
	});
	expect(result.rewards).toMatchObject({ state: 'ready', value: { rangeId: '20261014-20261020' } });
	expect(
		fetcher.mock.calls.filter(([url]) => String(url).includes('?start')).map(([url]) => url)
	).toEqual([
		`${config.proposalApiBaseUrl}?start=2026-10-21&end=2026-10-27`,
		`${config.proposalApiBaseUrl}?start=2026-10-14&end=2026-10-20`
	]);
});
it('serves quests metadata without any upstream request or hero chrome', async () => {
	const result = await run('quests.voirewards.com');
	expect(result).toEqual({
		page: 'quests',
		pageMetaTags: {
			title: 'Voi Testnet Quests',
			description: 'Get Your Quest On, with the Voi Testnet Network',
			imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png'
		}
	});
	expect(fetcher).not.toHaveBeenCalled();
});
it('starts all four critical upstreams before releasing any response, with deadline signals', async () => {
	const releases: (() => void)[] = [];
	fetcher.mockImplementation((input, init) => {
		expect(init?.signal).toBeInstanceOf(AbortSignal);
		return new Promise((resolve) =>
			releases.push(() => resolve(Response.json(body(String(input)))))
		);
	});
	const pending = run();
	expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(
		expect.arrayContaining([
			config.proposalApiBaseUrl,
			`${config.proposalApiBaseUrl}?start=2026-10-21&end=2026-10-27`,
			'/api/epochs',
			`${config.proposalApiBaseUrl}?action=online-stake-history`
		])
	);
	releases.forEach((release) => release());
	const result = dashboard(await pending);
	expect(result.rewards.state).toBe('ready');
});
it.each(['/api/epochs', '?start'])(
	'isolates %s failures to dependent sections',
	async (failing) => {
		fetcher.mockImplementation(async (input) =>
			String(input).includes(failing)
				? new Response(null, { status: 500 })
				: Response.json(body(String(input)))
		);
		const result = dashboard(await run());
		expect(result.headline.state).toBe('error');
		expect(result.onlineStake.state).toBe('ready');
		expect(result.rewards.state).toBe(failing === '?start' ? 'error' : 'ready');
		expect(result.aprHistory.state).toBe(failing === '/api/epochs' ? 'error' : 'ready');
	}
);

it('includes parameters for synchronous SSR reward estimates, even if epoch history fails', async () => {
	fetcher.mockImplementation(async (input) =>
		String(input).includes('/api/epochs')
			? new Response(null, { status: 503 })
			: Response.json(body(String(input)))
	);
	const result = dashboard(await run());
	expect(result.rewards).toMatchObject({
		state: 'ready',
		value: {
			data: rows,
			params: { block_reward_pool: 2236808, total_blocks: 126874, total_blocks_projected: 216102 }
		}
	});
	if (result.rewards.state !== 'error') {
		expect(result.rewards.value.params.reward_per_block).toBeCloseTo(10.3507, 4);
	}
});
