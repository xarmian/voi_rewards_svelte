import { expect, test, vi } from 'vitest';
import { config } from '$lib/config';
import { epochRange } from './calendar';
import { liveEpochHistory } from './source';

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

test('a refresh clears the client cache before fetching the epoch rows', async () => {
	calls.length = 0;
	await liveEpochHistory.rows(104, { refresh: true });
	expect(calls).toEqual(['clearCache', `fetchData ${epochRange(104).id}`]);
	calls.length = 0;
	await liveEpochHistory.rows(103);
	expect(calls).toEqual([`fetchData ${epochRange(103).id}`]);
});
