import { afterEach, expect, it, vi } from 'vitest';
import {
	deriveHeadline,
	blocksForEpoch,
	headlineValues,
	priceTile,
	onlineStakeTile,
	accountsDetail,
	rewardsRefreshMode
} from './headline';
import { extrapolateRewardPerBlock, getTokensByEpoch } from '$lib/utils';
import { MISSING, usd } from '$lib/ds/format';
import type { Headline } from '$lib/server/home';
const now = new Date('2026-10-25T02:38:00Z');
const epochs = [
	{
		epoch_number: 104,
		apr: 16.04,
		online_stake: 729891544.76,
		eligible_online_stake: 725200000,
		participating_wallets: 97
	},
	{ epoch_number: 103, apr: 16.2 }
];
async function fixture(timestamp = now.toISOString()) {
	const pool = await getTokensByEpoch(104);
	return deriveHeadline(
		{
			epoch: 104,
			epochs,
			pool,
			blocks: 126874,
			maxTimestamp: timestamp,
			projection: extrapolateRewardPerBlock(126874, pool, '20261021-20261027')
		},
		now
	);
}
afterEach(() => vi.useRealTimers());
it('derives the snapshot from VOI stake and the legacy range projection', async () => {
	vi.useFakeTimers();
	vi.setSystemTime(now);
	const h = await fixture();
	expect(h.apr).toBe(16.04);
	expect(h.prevApr).toBe(16.2);
	expect(h.pool).toBe(2236808);
	expect(Math.abs(h.perMillion - 3084)).toBeLessThan(1);
	expect(h.voiPerBlock).toBeCloseTo(10.35, 2);
	expect(h.projectedBlocks).toBe(216102);
	expect(h.elapsedDays).toBeCloseTo(4.1, 1);
	expect(h.earningAccounts).toBe(97);
	expect(h.onlineStake).toBe(729891544.76);
});
it('clamps elapsed days at both ends', async () => {
	expect((await fixture('2026-10-20T00:00:00Z')).elapsedDays).toBe(0);
	const h = deriveHeadline(
		{
			epoch: 104,
			epochs,
			pool: 1,
			blocks: 1,
			maxTimestamp: '2026-11-01',
			projection: { projectedTotalBlocks: 1, projectedRewardPerBlock: 1 }
		},
		new Date('2026-11-02')
	);
	expect(h.elapsedDays).toBe(7);
});
it('keeps the pre-62 ballast formula', () => {
	expect(blocksForEpoch(61, { num_blocks: 120, num_blocks_ballast: 90 })).toBe(160);
	expect(blocksForEpoch(62, { num_blocks: 120, num_blocks_ballast: 90 })).toBe(120);
});
it('formats missing and non-finite headline values as missing', () => {
	const h = deriveHeadline(
		{
			epoch: 104,
			epochs: [],
			pool: NaN,
			blocks: NaN,
			maxTimestamp: '',
			projection: { projectedTotalBlocks: NaN, projectedRewardPerBlock: NaN }
		},
		now
	);
	expect(Object.values(headlineValues(h))).toEqual(Array(7).fill(MISSING));
});
it('maps streamed price props and never presents an error as $0', () => {
	const props = priceTile({
		state: 'ready',
		value: { price: 0.000127, change24h: -1.01, mcap: 265986 }
	});
	expect(props).toMatchObject({
		state: 'ready',
		href: '/markets',
		value: usd(0.000127),
		change: { value: -1.01, label: '24h' },
		detail: `24h · mcap ${usd(265986)}`
	});
	expect(priceTile({ state: 'error', message: 'offline' })).toMatchObject({
		state: 'error',
		value: MISSING
	});
});
it('shows the current online stake and draws the daily-average history only as the trend', () => {
	const headline = {
		state: 'ready' as const,
		value: { onlineStake: 729891544.76 } as Headline
	};
	const history = {
		state: 'ready' as const,
		value: [
			{ date: '2026-10-27', stake: 750000000 },
			// Today's partial-day average must not become the headline number.
			{ date: '2026-10-28', stake: 727610000 }
		]
	};
	expect(onlineStakeTile(headline, history)).toMatchObject({
		state: 'ready',
		value: '729.9M',
		trend: [750000000, 727610000],
		detail: 'VOI · 30-day daily avg',
		href: '/analytics'
	});
	// Before the stream resolves, and if it fails, the value stands without a trend.
	for (const tile of [
		onlineStakeTile(headline),
		onlineStakeTile(headline, { state: 'error', message: 'offline' })
	])
		expect(tile).toMatchObject({ state: 'ready', value: '729.9M', trend: [], detail: 'VOI' });
	expect(
		onlineStakeTile({ state: 'ready', value: { onlineStake: null } as Headline }, history)
	).toMatchObject({ value: MISSING });
	expect(onlineStakeTile({ state: 'error', message: 'offline' }, history)).toMatchObject({
		state: 'error',
		value: MISSING
	});
});
it('maps online count to a detail only on success', () => {
	expect(accountsDetail({ state: 'ready', value: 152 })).toBe('/ 152 online');
	expect(accountsDetail({ state: 'error', message: 'offline' })).toBeUndefined();
});

it('refreshes server rows and params only before the user chooses an epoch', () => {
	const ready = { state: 'ready' } as const;
	expect(rewardsRefreshMode(ready, false)).toBe('all');
	expect(rewardsRefreshMode(ready, true)).toBe('dates');
});

it.each([false, true])('an error retry preserves visible rows (user selected: %s)', (selected) => {
	expect(rewardsRefreshMode({ state: 'error' }, selected)).toBe('none');
});
