import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { extrapolateRewardPerBlock } from '$lib/utils';
import {
	filterProposer,
	rewardsCSV,
	rewardRows,
	rewardsClock,
	showAfterFavouritesChange,
	totalBlocksFor,
	type EpochResponse
} from './rewards';

const addr = 'QKCTN6IX3TFNGN6LXSBNQQERXZUUXNDRTQWDTQBMHBZOTXLYJCEABU6ZX4';
const response: EpochResponse = {
	data: [{ proposer: addr, block_count: 44014 }],
	num_blocks: 126874,
	num_blocks_ballast: 0,
	blacklist: []
};
const options = {
	epoch: 104,
	rangeId: '20261021-20261027',
	pool: 2236808,
	now: new Date('2026-10-25T02:38:45Z'),
	price: 0.000127
};
test('empty favourites returns to All; nonempty favourites preserves the selected view', () => {
	assert.equal(showAfterFavouritesChange('favourites', 0), 'all');
	assert.equal(showAfterFavouritesChange('all', 0), 'all');
	assert.equal(showAfterFavouritesChange('favourites', 1), 'favourites');
	assert.equal(showAfterFavouritesChange('all', 1), 'all');
});
test('rewards clock preserves the server timestamp and falls back for missing or invalid values', () => {
	const now = options.now.getTime();
	assert.equal(rewardsClock('2026-10-24T00:00:00Z', now).toISOString(), '2026-10-24T00:00:00.000Z');
	assert.equal(rewardsClock(undefined, now).getTime(), now);
	assert.equal(rewardsClock('not-a-date', now).getTime(), now);
});
test('an invalid server timestamp still produces numeric reward and USD estimates', () => {
	const [row] = rewardRows(response, {
		...options,
		now: rewardsClock('not-a-date', options.now.getTime())
	});
	assert.equal(typeof row.est, 'number');
	assert.equal(typeof row.usd, 'number');
	assert.deepEqual(row, rewardRows(response, options)[0]);
});
test('epoch 104 snapshot reward, share and USD', () => {
	const [row] = rewardRows(response, options);
	assert.equal(row.addr, addr);
	assert.equal(row.rank, 1);
	assert.equal(row.blocks, 44014);
	assert.ok(Math.abs(row.share! - 0.347) < 0.001);
	assert.ok(Math.abs(row.est! - 455635) < 1);
	assert.ok(Math.abs(row.usd! - 57.87) < 0.01);
});
test('ranks sort by blocks, preserve ties and exclude ballast addresses', () => {
	const rows = rewardRows(
		{
			...response,
			blacklist: ['ballast'],
			data: [
				{ proposer: 'a', block_count: 1 },
				{ proposer: 'b', block_count: 4 },
				{ proposer: 'c', block_count: 4 },
				{ proposer: 'ballast', block_count: 99 }
			]
		},
		options
	);
	assert.deepEqual(
		rows.map(({ addr, rank }) => [addr, rank]),
		[
			['b', 1],
			['c', 2],
			['a', 3]
		]
	);
});
test('ballast is capped at one third before epoch 62 only', () => {
	assert.equal(totalBlocksFor(61, { ...response, num_blocks: 90, num_blocks_ballast: 60 }), 120);
	assert.equal(totalBlocksFor(61, { ...response, num_blocks: 90, num_blocks_ballast: 12 }), 102);
	assert.equal(totalBlocksFor(62, { ...response, num_blocks: 90, num_blocks_ballast: 60 }), 90);
});
test('zero or nonfinite totals never invent a share, reward or USD', () => {
	for (const total of [0, NaN, Infinity]) {
		const [row] = rewardRows({ ...response, num_blocks: total }, options);
		assert.deepEqual([row.share, row.est, row.usd], [null, null, null]);
	}
});
test('missing price affects USD only; a finished epoch divides the pool by total blocks', () => {
	const [row] = rewardRows(response, { ...options, now: new Date('2026-11-01'), price: null });
	assert.equal(row.usd, null);
	assert.equal(row.est, 44014 * (options.pool / response.num_blocks));
	assert.ok(row.share! > 0);
});
test('explicit-clock projection matches the legacy utility in live and finished epochs', () => {
	vi.useFakeTimers();
	try {
		for (const now of [options.now, new Date('2026-11-01')]) {
			vi.setSystemTime(now);
			const expected = extrapolateRewardPerBlock(
				response.num_blocks,
				options.pool,
				options.rangeId
			);
			assert.equal(
				rewardRows(response, { ...options, now })[0].est,
				44014 * expected.projectedRewardPerBlock
			);
		}
	} finally {
		vi.useRealTimers();
	}
});
test('filter keeps the legacy case-insensitive address, name, nickname and node fields', () => {
	const row = {
		addr: 'ADDRESS',
		name: 'alice.voi',
		nickname: 'Home',
		nodes: [{ node_name: null }, { node_name: 'Office node' }]
	};
	for (const query of ['', 'add', 'ALICE', 'home', 'OFFICE'])
		assert.equal(filterProposer(row, query), true);
	assert.equal(filterProposer(row, 'absent'), false);
	assert.equal(filterProposer({ addr: 'other' }, 'home'), false);
});
test('CSV exports exactly the supplied filtered rows and unrounded estimates', () => {
	const rows = rewardRows(response, options);
	assert.equal(rewardsCSV(rows), `account,block_rewards\n${addr},${rows[0].est}`);
	assert.equal(rewardsCSV([]), 'account,block_rewards\n');
	assert.equal(rewardsCSV([{ ...rows[0], est: null }]), `account,block_rewards\n${addr},`);
});
