import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readEpoch, epochUrl } from './url';
const url = (value = '') => new URL(`https://example.test/ds${value}`);
describe('readEpoch', () => {
	test('accepts an integer inside the bounds', () => {
		assert.equal(readEpoch(url('?epoch=103'), 1, 104), 103);
	});
	test('missing, invalid and out-of-range values use max', () => {
		for (const query of [
			'',
			'?epoch=abc',
			'?epoch=0',
			'?epoch=105',
			'?epoch=1.5',
			'?epoch=',
			'?epoch=NaN'
		]) {
			assert.equal(readEpoch(url(query), 1, 104), 104, query);
		}
		assert.equal(readEpoch(url('?epoch=99'), 100, 104), 104);
	});
});
describe('epochUrl', () => {
	test('omits the latest epoch, preserves other parameters and hash, and does not mutate input', () => {
		const source = url('?theme=light&epoch=102&filter=a&filter=b#table');
		assert.equal(
			epochUrl(source, 104, 104).href,
			'https://example.test/ds?theme=light&filter=a&filter=b#table'
		);
		assert.equal(source.searchParams.get('epoch'), '102');
	});
	test('sets and round-trips an older epoch', () => {
		const result = epochUrl(url('?theme=dark#table'), 103, 104);
		assert.equal(result.href, 'https://example.test/ds?theme=dark&epoch=103#table');
		assert.equal(readEpoch(result, 1, 104), 103);
	});
});
