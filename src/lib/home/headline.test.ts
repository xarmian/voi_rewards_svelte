import { expect, it } from 'vitest';
import { priceTile, onlineStakeTile } from './headline';
import { MISSING, usd } from '$lib/ds/format';
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
	const current = { state: 'ready' as const, value: 729891544.76 };
	const history = {
		state: 'ready' as const,
		value: [
			{ date: '2026-10-27', stake: 750000000 },
			// Today's partial-day average must not become the headline number.
			{ date: '2026-10-28', stake: 727610000 }
		]
	};
	expect(onlineStakeTile(current, history)).toMatchObject({
		state: 'ready',
		value: '729.9M',
		trend: [750000000, 727610000],
		detail: 'VOI · 30-day daily avg',
		href: '/analytics'
	});
	// Before the stream resolves, and if it fails, the value stands without a trend.
	for (const tile of [
		onlineStakeTile(current),
		onlineStakeTile(current, { state: 'error', message: 'offline' })
	])
		expect(tile).toMatchObject({ state: 'ready', value: '729.9M', trend: [], detail: 'VOI' });
	expect(onlineStakeTile({ state: 'ready', value: null }, history)).toMatchObject({
		value: MISSING
	});
	expect(onlineStakeTile({ state: 'error', message: 'offline' }, history)).toMatchObject({
		state: 'error',
		value: MISSING
	});
});
it('without the epoch value, shows the last daily average and waits for the history', () => {
	const history = {
		state: 'ready' as const,
		value: [
			{ date: '2026-10-27', stake: 750000000 },
			{ date: '2026-10-28', stake: 727610000 }
		]
	};
	expect(onlineStakeTile(undefined, history)).toMatchObject({
		state: 'ready',
		value: '727.6M',
		trend: [750000000, 727610000],
		detail: 'VOI · 30-day daily avg'
	});
	expect(onlineStakeTile(undefined)).toMatchObject({ state: 'loading', value: MISSING });
	expect(onlineStakeTile(undefined, { state: 'ready', value: [] })).toMatchObject({
		state: 'ready',
		value: MISSING
	});
	expect(onlineStakeTile(undefined, { state: 'error', message: 'offline' })).toMatchObject({
		state: 'error',
		value: MISSING
	});
});
