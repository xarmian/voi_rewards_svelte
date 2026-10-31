import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// TASK-92: the C2 follow-up population, bounded the same way as upstreamDeadlines.test.ts (TASK-26).
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('$lib/supabase', () => ({ supabasePublicClient: mocks }));
vi.mock('$lib/server/supabase', () => ({ supabasePrivateClient: mocks }));
vi.mock('$lib/mimir', () => ({ mimirClient: mocks }));

import { GET as relayRewards } from '../../routes/api/relay-rewards/+server';
import { GET as phase2 } from '../../routes/api/phase2/+server';
import { GET as eligibility } from '../../routes/api/eligibility/+server';
import { GET as ohlcv } from '../../routes/api/ohlcv/+server';
import { GET as reports } from '../../routes/api/reports/+server';
import { GET as quests } from '../../routes/api/quests/+server';
import { load as leaderboardLoad } from '../../routes/(site)/leaderboard/+page.server';
import { load as relaysLoad } from '../../routes/(site)/relays/+page.server';
import { load as phase2Load } from '../../routes/(site)/phase2/[...slug]/+page.server';
import { fetchProjects } from '../../routes/(site)/phase2/[...slug]/projects';

const WALLET = 'A'.repeat(58);
let stalled = '';
// A single-row read on any site resolves with no row.
let noRow = false;
// A query on this site resolves at once with an error (not a stall).
let failed = '';
let failedCode: string | undefined;
const signals: Array<{ site: string; signal: AbortSignal }> = [];

// Like postgrest-js without throwOnError: aborting fetch resolves a result with error.
function query(site: string) {
	let signal: AbortSignal | undefined;
	let single = false;
	const builder: Record<string, unknown> = {
		abortSignal: (value: AbortSignal) => {
			signal = value;
			signals.push({ site, signal });
			return builder;
		},
		single: () => {
			single = true;
			return builder;
		},
		maybeSingle: () => {
			single = true;
			return builder;
		},
		then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
			const result =
				site === failed
					? Promise.resolve({ data: null, count: null, error: { code: failedCode, message: 'upstream failed' } })
					: site === stalled
					? new Promise((done) => {
							const abort = () => done({ data: null, error: { message: 'upstream aborted' } });
							if (signal?.aborted) abort();
							else signal?.addEventListener('abort', abort, { once: true });
						})
					: Promise.resolve(
							single && noRow
								? { data: null, error: null }
								: { data: single ? { airdrop_amount: 7, peer_date: '2024-11-05' } : [], count: 3, error: null }
						);
			return result.then(resolve, reject);
		}
	};
	for (const method of ['select', 'eq', 'not', 'gte', 'lte', 'lt', 'in', 'or', 'order', 'limit', 'range', 'returns'])
		builder[method] = () => builder;
	return builder;
}

const event = (path: string, fetcher: typeof fetch = vi.fn<typeof fetch>()) =>
	({ url: new URL(path, 'https://example.test'), fetch: fetcher, params: {} }) as never;

// Settle within the 5000 ms deadline plus slack; undefined means the call is still waiting.
async function settle<T>(run: () => Promise<T>) {
	let outcome: { value?: T; error?: unknown } | undefined;
	run().then(
		(value) => (outcome = { value }),
		(error) => (outcome = { error })
	);
	await vi.advanceTimersByTimeAsync(4999);
	const early = outcome;
	await vi.advanceTimersByTimeAsync(101);
	return { early, outcome };
}

beforeEach(() => {
	vi.useFakeTimers();
	// Node's native AbortSignal.timeout does not use Vitest's fake clock.
	vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
		return controller.signal;
	});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	signals.length = 0;
	stalled = '';
	noRow = false;
	failed = '';
	failedCode = undefined;
	mocks.from.mockImplementation((site: string) => query(site));
	vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => new Promise(() => {})));
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function expectAborted(site: string) {
	const recorded = signals.filter((entry) => entry.site === site);
	expect(recorded.length).toBeGreaterThan(0);
	for (const { signal } of recorded) expect(signal.aborted).toBe(true);
	expect(AbortSignal.timeout).toHaveBeenCalledWith(5000);
}

it.each([
	['relay-rewards peers', relayRewards, '/api/relay-rewards', 'vr_relay_peers'],
	['relay-rewards wallets', relayRewards, '/api/relay-rewards', 'vr_relay_wallets'],
	['phase2 wallet', phase2, `/api/phase2?wallet=${WALLET}`, 'vr_phase2'],
	['phase2 page', phase2, '/api/phase2?fetchAll=true', 'vr_phase2'],
	['phase2 csv count', phase2, '/api/phase2?fetchAll=true&csv=true', 'vr_phase2'],
	['eligibility', eligibility, `/api/eligibility?wallet=${WALLET}`, 'addresses'],
	['ohlcv', ohlcv, '/api/ohlcv?baseTokenId=0&quoteTokenId=302190', 'price_candles']
] as const)('%s answers 500 by the deadline when its query stalls', async (_, handler, path, site) => {
	stalled = site;
	const { early, outcome } = await settle(() => Promise.resolve(handler(event(path) as never)));
	expect(early, 'must not settle before the deadline').toBeUndefined();
	expect(outcome?.value, 'handler must settle by its deadline').toBeInstanceOf(Response);
	const response = outcome!.value as Response;
	expect(response.status).toBe(500);
	expect((await response.json()).error).toBeTruthy();
	expectAborted(site);
});

it.each([
	['a failed count is a 500, not an empty CSV', '/api/phase2?fetchAll=true&csv=true'],
	['a failed wallet query is a 500, not "Address not found"', `/api/phase2?wallet=${WALLET}`],
	['more than one row (PGRST116) is a 500, not "Address not found"', `/api/phase2?wallet=${WALLET}`, 'PGRST116']
])('phase2: %s', async (_, path, code?: string) => {
	failed = 'vr_phase2';
	failedCode = code;
	const response = await phase2(event(path) as never);
	expect(response.status).toBe(500);
});

it('phase2 still answers 404 for an address with no row', async () => {
	noRow = true;
	const response = await phase2(event(`/api/phase2?wallet=${WALLET}`) as never);
	expect(response.status).toBe(404);
});

it('leaderboard returns its error data by the deadline when vr_phase2 stalls', async () => {
	stalled = 'vr_phase2';
	const { outcome } = await settle(() => Promise.resolve(leaderboardLoad(event('/leaderboard') as never)));
	expect(outcome?.value).toMatchObject({ status: 500 });
	expectAborted('vr_phase2');
});

it('relays fails its load by the deadline when vr_relay_peers stalls', async () => {
	stalled = 'vr_relay_peers';
	const { outcome } = await settle(() => Promise.resolve(relaysLoad(event('/relays') as never)));
	expect(outcome?.error).toBeInstanceOf(Error);
	expectAborted('vr_relay_peers');
});

it.each(['vr_projects', 'vr_quests'])('fetchProjects keeps its [] contract when %s stalls', async (site) => {
	stalled = site;
	const { outcome } = await settle(() => fetchProjects());
	expect(outcome?.value).toEqual([]);
	expectAborted(site);
});

it.each(['leaderboard', 'vr_phase2', 'vr_quests'])(
	'the phase2 page load settles by the deadline when its %s wallet query stalls',
	async (site) => {
		stalled = site;
		const { outcome } = await settle(() =>
			Promise.resolve(phase2Load({ params: { slug: `${WALLET}/1` } } as never))
		);
		expect(outcome?.value).toBeTypeOf('object');
		expectAborted(site);
	}
);

it.each([
	['reports', () => reports(event('/api/reports', globalThis.fetch) as never), []],
	['quests', () => quests(event(`/api/quests?project=Algoleagues&wallet=${WALLET}`) as never), { error: 'Invalid project' }]
] as const)('%s bounds stalled headers AND bodies', async (_, run, fallback) => {
	for (const stage of ['headers', 'body']) {
		const upstream = Response.json({});
		vi.spyOn(upstream, 'json').mockImplementation(() => new Promise<never>(() => {}));
		const fetcher = vi.fn<typeof fetch>(() =>
			stage === 'headers' ? new Promise(() => {}) : Promise.resolve(upstream)
		);
		vi.stubGlobal('fetch', fetcher);
		const { early, outcome } = await settle(() => Promise.resolve(run()));
		expect(early, `${stage}: must not settle before the deadline`).toBeUndefined();
		expect(outcome?.value, `${stage}: must settle by the deadline`).toBeInstanceOf(Response);
		expect(await (outcome!.value as Response).json()).toEqual(fallback);
		expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
	}
});

it('the markets load renders with an empty chart when price history fails', async () => {
	const { load } = await import('../../routes/(site)/markets/+page');
	const fetcher = vi.fn(async (path: string) => {
		if (path.startsWith('/api/price-history')) throw new TypeError('network down');
		if (path.startsWith('/api/markets')) return Response.json({ marketData: [{ trading_pair_id: 1 }] });
		return Response.json({});
	});
	const data = await load({ fetch: fetcher, url: new URL('https://example.test/markets') } as never);
	expect(data).toMatchObject({ priceHistory: [], marketData: [{ trading_pair_id: 1 }] });
});
