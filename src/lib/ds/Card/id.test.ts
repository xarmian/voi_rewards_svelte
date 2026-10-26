import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { cardHeadingId } from './id';

describe('Card heading IDs', () => {
	test('deterministic title slug', () => {
		assert.equal(cardHeadingId('Node health'), 'ds-card-node-health');
		assert.equal(cardHeadingId('  Node / HEALTH!!  '), 'ds-card-node-health');
		assert.equal(cardHeadingId('Node health'), cardHeadingId('Node health'));
	});
});
