import { expect, test, vi } from 'vitest';
import { config } from '$lib/config';
import { epochRange } from './calendar';
import { startEpochHome } from './home.server';
import {
	epochHistory,
	liveEpochHistory,
	walletSummaryUrl,
	type EpochHistorySource
} from './source';
import type { Loaded } from '$lib/server/loaded';

const calls: string[] = [];
vi.mock('../../stores/dataTable', () => ({
	dataTable: {
		clearCache: vi.fn(() => calls.push('clearCache')),
		fetchData: vi.fn(async (id: string) => {
			calls.push(`fetchData ${id}`);
			return { data: [], num_blocks: 0, num_blocks_ballast: 0 };
		})
	}
}));

test('the live source keeps the URLs the home page fetches today', () => {
	expect(liveEpochHistory.kind).toBe('live');
	expect(liveEpochHistory.latestUrl()).toBe(config.proposalApiBaseUrl);
	expect(liveEpochHistory.statsUrl()).toBe('/api/epochs');
	expect(liveEpochHistory.rowsUrl(104)).toBe(
		`${config.proposalApiBaseUrl}?start=2026-10-21&end=2026-10-27`
	);
});

test('the wallet epoch summary URL is the one the rewards tab fetches today', () => {
	expect(walletSummaryUrl('A B')).toBe(
		`${config.proposalApiBaseUrl}?action=epoch-summary&wallet=A%20B`
	);
});

test('a refresh clears the client cache before fetching the epoch rows', async () => {
	calls.length = 0;
	await liveEpochHistory.rows(104, { refresh: true });
	expect(calls).toEqual(['clearCache', `fetchData ${epochRange(104).id}`]);
	calls.length = 0;
	await liveEpochHistory.rows(103);
	expect(calls).toEqual([`fetchData ${epochRange(103).id}`]);
});

test('the history source in use is the live one', () => {
	expect(epochHistory).toBe(liveEpochHistory);
});

test('the home epoch reads come from the source it is given', async () => {
	const now = new Date('2026-10-25T02:38:00Z');
	const source: EpochHistorySource = {
		kind: 'snapshot',
		latestUrl: () => '/snapshot/latest.json',
		statsUrl: () => '/snapshot/epochs.json',
		rowsUrl: (epoch) => `/snapshot/rows-${epoch}.json`,
		rows: () => Promise.reject(new Error('client only'))
	};
	const payloads: Record<string, unknown> = {
		'/snapshot/latest.json': { max_timestamp: now.toISOString() },
		'/snapshot/epochs.json': {
			epochs: [{ epoch_number: 104, apr: 16.04, online_stake: 729891544.76 }]
		},
		'/snapshot/rows-104.json': { data: [], num_blocks: 126874, num_blocks_ballast: 0 }
	};
	const urls: string[] = [];
	const read = async <T>(url: string, parse: (value: unknown) => T): Promise<Loaded<T>> => {
		urls.push(url);
		return { state: 'ready', value: parse(payloads[url]) };
	};
	const pending = startEpochHome({
		url: new URL('https://voirewards.com/'),
		now,
		startedAt: now.getTime(),
		read,
		source
	});
	// Every read starts before the caller awaits anything.
	expect(urls).toEqual([
		'/snapshot/latest.json',
		'/snapshot/rows-104.json',
		'/snapshot/epochs.json'
	]);
	const epoch = await pending;
	expect(urls.filter((url) => url.startsWith(config.proposalApiBaseUrl))).toEqual([]);
	expect(epoch).toMatchObject({
		currentEpoch: 104,
		rewardsEpoch: 104,
		headline: { state: 'ready', value: { epoch: 104 } },
		rewards: { state: 'ready', value: { rangeId: epochRange(104).id } },
		currentStake: { state: 'ready', value: 729891544.76 }
	});
});
