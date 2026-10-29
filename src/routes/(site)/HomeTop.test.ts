import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import HomeTop from './HomeTop.svelte';
import type { DashboardData } from '$lib/server/home';
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
function fixture(pending = false): DashboardData {
	return {
		page: 'dashboard',
		chrome: 'hero',
		currentEpoch: 104,
		rewardsEpoch: 104,
		markets: Promise.resolve({
			state: 'ready',
			value: { rows: [], volume24h: null, liquidity: null, asOf: '2026-10-25T02:38:45Z' }
		}),
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
				earningAccounts: 97
			}
		},
		currentStake: { state: 'ready', value: 729891544.76 },
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
				rangeId: '20261021-20261027',
				data: { data: [], num_blocks: 126874, num_blocks_ballast: 0 },
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
		// SSR shows the current online stake from epoch-detail, never the history's last average.
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
