import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { tableId, detailsId } from './ids';
describe('table ids', () => {
	test('caption supplies an SSR-stable default', () => {
		assert.equal(tableId("Who's earning this epoch"), 'ds-table-who-s-earning-this-epoch');
	});
	test('explicit ids are used verbatim', () => {
		assert.equal(tableId('Ignored', 'Custom-ID'), 'Custom-ID');
	});
	test('details ids are stable and distinguish row keys and tables', () => {
		assert.equal(detailsId('table', 'Wallet A'), 'table-details-wallet-a');
		assert.notEqual(detailsId('table', 'Wallet A'), detailsId('table', 'Wallet B'));
		assert.notEqual(detailsId('table', 'Wallet A'), detailsId('other', 'Wallet A'));
		assert.equal(detailsId('table', 'Wallet A'), detailsId('table', 'Wallet A'));
	});
});
