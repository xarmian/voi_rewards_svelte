import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import HomeTop from './HomeTop.svelte';
import type { DashboardData } from '$lib/server/home';
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
function fixture(pending = false): DashboardData {
	return {
		page: 'dashboard',
		chrome: 'hero',
		headline: {
			state: 'ready',
			value: {
				epoch: 104,
				rangeId: '20261021-20261027',
				rangeLabel: 'Oct 21 – Oct 27, 2026',
				apr: 16.04,
				prevApr: 16.2,
				pool: 2236808,
				blocks: 126874,
				projectedBlocks: 216074,
				voiPerBlock: 10.35,
				perMillion: 3084,
				elapsedDays: 4.1,
				earningAccounts: 97,
				onlineStake: 729891544.76
			}
		},
		aprHistory: {
			state: 'ready',
			value: [
				{ epoch: 103, apr: 16.2, wallets: 99 },
				{ epoch: 104, apr: 16.04, wallets: 97 }
			]
		},
		onlineStake: pending
			? new Promise(() => {})
			: Promise.resolve({
					state: 'ready',
					value: [{ date: '2026-10-25', stake: 725200000 }]
				}),
		rewards: {
			state: 'ready',
			value: {
				dates: [],
				rangeId: '20261021-20261027',
				data: {},
				params: {
					block_reward_pool: 2236808,
					total_blocks: 126874,
					reward_per_block: 10.3507,
					total_blocks_projected: 216102
				}
			}
		},
		price: pending
			? new Promise(() => {})
			: Promise.resolve({
					state: 'ready',
					value: { price: 0.000127, change24h: -1.01, mcap: 265986 }
				}),
		onlineCount: pending ? new Promise(() => {}) : Promise.resolve({ state: 'ready', value: 152 })
	};
}
it.each([false, true])(
	'SSR renders critical values and pending stream placeholders (pending=%s)',
	(pending) => {
		const { body } = render(HomeTop, { props: { data: fixture(pending) } });
		expect(body.match(/<h1\b/g)).toHaveLength(1);
		expect(body).toContain('16.04%');
		expect(body).toContain('role="progressbar"');
		expect(body).toContain('aria-valuemax="7"');
		expect(body.match(/href="\/analytics"/g)).toHaveLength(3);
		// SSR shows the current online stake from the headline, never the history's last average.
		expect(body).toContain('729.9M');
		expect(body).not.toContain('725.2M');
		expect(body).not.toContain('Loading Online stake');
		expect(body).toContain('126.9k');
		expect(body).toContain('97');
		expect(body).toContain('aria-busy="true"');
		expect(body).toContain('Loading VOI price');
		expect(body).not.toContain('$0');
		expect(body).toContain('role="search"');
		expect(body).not.toContain('>Try<');
	}
);
it('shows a retry alert for a failed headline without a zero APR', () => {
	const data = fixture();
	data.headline = { state: 'error', message: 'Headline unavailable' };
	const { body } = render(HomeTop, { props: { data } });
	expect(body).toContain('role="alert"');
	expect(body).toMatch(/<button[^>]*>[\s\S]*?Retry/);
	expect(body).not.toContain('0%');
	expect(body).not.toContain('Staking currently earns');
});

// Keep this legacy consumer's initialization under test without importing wallet widgets.
vi.mock('./RewardsTable.svelte', () => ({ default: vi.fn() }));
import Dashboard from './Dashboard.svelte';
import RewardsTable from './RewardsTable.svelte';
import { get } from 'svelte/store';
import { rewardParams } from '../../stores/dataTable';

it('initializes the legacy table parameters and rows synchronously during SSR', () => {
	const initial = fixture().rewards;
	if (initial.state === 'error') throw new Error('Expected rows');
	const rows = [{ proposer: 'fixture-wallet', block_count: 126874, health_rewards: 0 }];
	const params = {
		block_reward_pool: 2236808,
		total_blocks: 126874,
		reward_per_block: 10.3507,
		total_blocks_projected: 216102
	};
	Object.assign(initial.value, {
		params,
		data: { data: rows, num_blocks: 126874, num_blocks_ballast: 0 },
		dates: [{ id: '20261021-20261027', desc: '2026-10-21 to 2026-10-27', epoch: 104 }]
	});
	rewardParams.set({
		block_reward_pool: 0,
		total_blocks: 0,
		reward_per_block: 0,
		total_blocks_projected: 0
	});
	const { body } = render(Dashboard, { props: { initial } });
	expect(get(rewardParams)).toEqual(params);
	expect(body).toContain('2026-10-21 to 2026-10-27');
	expect(RewardsTable).toHaveBeenCalledWith(
		expect.anything(),
		expect.objectContaining({ items: rows })
	);
});
