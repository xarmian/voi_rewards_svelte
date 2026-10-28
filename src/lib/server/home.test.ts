import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { load } from '../../routes/(site)/+page.server';
import { config } from '$lib/config';
import { CRITICAL_TIMEOUT_MS, STAKE_TIMEOUT_MS, STREAM_TIMEOUT_MS, type HomeData } from './home';
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
				online_stake: epoch_number === 104 ? 729891544.76 : 720000000,
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
it.each(['/api/markets', '/api/mimir', 'online-stake-history'])(
	'rewards never wait for %s; its deadline resolves to error',
	async (slow) => {
		fetcher.mockImplementation(async (input) =>
			String(input).includes(slow) ? new Promise(() => {}) : Response.json(body(String(input)))
		);
		const loaded = vi.fn();
		const pending = run().then((result) => {
			loaded();
			return result;
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(loaded).toHaveBeenCalledOnce();
		const result = dashboard(await pending);
		expect(result.chrome).toBe('hero');
		expect(result.headline.state).toBe('ready');
		// The current online stake is critical-path epoch-detail data, not the slow history stream.
		expect(result.currentStake).toEqual({ state: 'ready', value: 729891544.76 });
		expect(result.rewards.state).toBe('ready');
		const streamed =
			slow === '/api/markets'
				? result.price
				: slow === '/api/mimir'
					? result.onlineCount
					: result.onlineStake;
		expect(streamed).toBeInstanceOf(Promise);
		const settled = vi.fn();
		void streamed.then(settled);
		const deadline = slow === 'online-stake-history' ? STAKE_TIMEOUT_MS : STREAM_TIMEOUT_MS;
		await vi.advanceTimersByTimeAsync(deadline - 100);
		expect(settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(200);
		expect(await streamed).toMatchObject({ state: 'error' });
	}
);
it('streams stake history that takes 6s (past the 5s stream deadline) with the same filtered 30-day VOI series', async () => {
	const history = [
		{ date: '2026-10-25', avg_online_stake: 725200000e6 },
		{ date: '2026-09-25', avg_online_stake: 800000000e6 },
		{ date: '2026-09-26', avg_online_stake: 750000000e6 },
		{ date: '2026-10-26', avg_online_stake: 700000000e6 },
		{ date: '2026-10-24', avg_online_stake: 'invalid' }
	];
	fetcher.mockImplementation((input) =>
		String(input).includes('online-stake-history')
			? new Promise((resolve) => {
					setTimeout(() => resolve(Response.json(history)), 6000);
				})
			: Promise.resolve(Response.json(body(String(input))))
	);
	const loaded = vi.fn();
	const pending = run().then((result) => {
		loaded();
		return result;
	});
	await vi.advanceTimersByTimeAsync(0);
	expect(loaded).toHaveBeenCalledOnce();
	const result = dashboard(await pending);
	await vi.advanceTimersByTimeAsync(6000);
	expect(await result.onlineStake).toEqual({
		state: 'ready',
		value: [
			{ date: '2026-09-26', stake: 750000000 },
			{ date: '2026-10-25', stake: 725200000 }
		]
	});
});
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
	expect((await result.onlineStake).state).toBe('ready');
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
	await vi.advanceTimersByTimeAsync(STAKE_TIMEOUT_MS - 4100);
	expect((await result.onlineStake).state).toBe('error');
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
	expect(result.currentStake).toEqual({ state: 'ready', value: 720000000 });
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
it('starts all critical upstreams and stake history before releasing any response, with deadline signals', async () => {
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
		expect((await result.onlineStake).state).toBe('ready');
		// The current stake needs only /api/epochs, not the rows that fail the headline.
		expect(result.currentStake.state).toBe(failing === '/api/epochs' ? 'error' : 'ready');
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

it('prefetches both epoch rows before any response in the first day, even with a 3.9s base read', async () => {
	vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
	const started = Date.now();
	const current = `${config.proposalApiBaseUrl}?start=2026-10-21&end=2026-10-27`;
	const previous = `${config.proposalApiBaseUrl}?start=2026-10-14&end=2026-10-20`;
	fetcher.mockImplementation(
		(input) =>
			new Promise((resolve) => {
				const url = String(input);
				setTimeout(
					() =>
						resolve(
							Response.json(
								url === config.proposalApiBaseUrl
									? { max_timestamp: '2026-10-20T23:59:00Z' }
									: body(url)
							)
						),
					url === config.proposalApiBaseUrl ? 3900 : url.includes('?start') ? 3950 : 10
				);
			})
	);
	const settled = vi.fn();
	const pending = run().then((value) => {
		settled(Date.now() - started);
		return value;
	});
	expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(
		expect.arrayContaining([current, previous])
	);
	await vi.advanceTimersByTimeAsync(CRITICAL_TIMEOUT_MS + 100);
	expect(settled).toHaveBeenCalledWith(3950);
	const result = dashboard(await pending);
	expect(result.rewards).toMatchObject({ state: 'ready', value: { rangeId: '20261014-20261020' } });
	expect(result.headline).toMatchObject({ state: 'ready', value: { epoch: 103 } });
});

it.each([
	['2026-10-25T02:38:00Z', '2026-10-20T23:59:00Z', '2026-10-14'],
	['2026-10-21T12:00:00Z', '2026-10-13T23:59:00Z', '2026-10-07']
])(
	'bounds a late lag correction at %s to the remaining second',
	async (clock, timestamp, start) => {
		vi.setSystemTime(new Date(clock));
		const started = Date.now();
		const lateUrl = `${config.proposalApiBaseUrl}?start=${start}`;
		let lateStarted: number | undefined;
		let lateSignal: AbortSignal | null | undefined;
		fetcher.mockImplementation((input, init) => {
			const url = String(input);
			if (url === config.proposalApiBaseUrl)
				return new Promise((resolve) => {
					setTimeout(() => resolve(Response.json({ max_timestamp: timestamp })), 3000);
				});
			if (url.startsWith(lateUrl)) {
				lateStarted = Date.now() - started;
				lateSignal = init?.signal;
				return new Promise(() => {});
			}
			return Promise.resolve(Response.json(body(url)));
		});
		const settled = vi.fn();
		const pending = run().then((value) => {
			settled(Date.now() - started);
			return value;
		});
		await vi.advanceTimersByTimeAsync(3000);
		expect(lateStarted).toBe(3000);
		expect(lateSignal?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(999);
		expect(settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(101);
		expect(settled).toHaveBeenCalledWith(CRITICAL_TIMEOUT_MS);
		expect(lateSignal?.aborted).toBe(true);
		const result = dashboard(await pending);
		expect(result.rewards.state).toBe('error');
		expect(result.headline.state).toBe('error');
		expect(result.aprHistory.state).toBe('ready');
	}
);

it.each(['2026-10-22T00:00:00Z', now.toISOString()])(
	'does not prefetch previous rows outside the first day at %s without a lag',
	async (clock) => {
		vi.setSystemTime(new Date(clock));
		await run();
		expect(
			fetcher.mock.calls.filter(([url]) => String(url).includes('?start')).map(([url]) => url)
		).toEqual([`${config.proposalApiBaseUrl}?start=2026-10-21&end=2026-10-27`]);
	}
);

it('does not start a lag correction when processing the base response exhausts the budget', async () => {
	const started = Date.now();
	fetcher.mockImplementation(async (input) => {
		if (String(input) !== config.proposalApiBaseUrl) return Response.json(body(String(input)));
		const response = Response.json({ max_timestamp: '2026-10-20T23:59:00Z' });
		const json = response.json.bind(response);
		response.json = async () => {
			const value = await json();
			vi.setSystemTime(started + CRITICAL_TIMEOUT_MS);
			return value;
		};
		return response;
	});
	const result = dashboard(await run());
	expect(result.rewards.state).toBe('error');
	expect(result.headline.state).toBe('error');
	expect(fetcher.mock.calls.filter(([url]) => String(url).includes('?start'))).toHaveLength(1);
});
