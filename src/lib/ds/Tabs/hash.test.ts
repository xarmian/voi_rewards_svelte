import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { LEGACY_HASHES, WALLET_TABS, resolveHash } from './hash';

describe('wallet hashes', () => {
	for (const [old, id] of Object.entries(LEGACY_HASHES)) {
		test(`${old} redirects to ${id}`, () => {
			assert.deepEqual(resolveHash(`#${old}`, WALLET_TABS), { id, replace: `#${id}` });
		});
	}
	for (const id of ['overview', 'rewards', 'contracts', 'holdings', 'calculator']) {
		test(`${id} is canonical`, () =>
			assert.deepEqual(resolveHash(`#${id}`, WALLET_TABS), { id, replace: null }));
	}
	test('empty and unknown hashes use the fallback without rewriting', () => {
		for (const hash of ['', '#', '#nope'])
			assert.deepEqual(resolveHash(hash, WALLET_TABS), { id: 'overview', replace: null });
		assert.deepEqual(resolveHash('#nope', ['one'], 'one'), { id: 'one', replace: null });
	});
	test('case and optional hash prefix', () => {
		assert.deepEqual(resolveHash('PORTFOLIO', WALLET_TABS), {
			id: 'holdings',
			replace: '#holdings'
		});
		assert.deepEqual(resolveHash('#REWARDS', WALLET_TABS), { id: 'rewards', replace: null });
	});
});
