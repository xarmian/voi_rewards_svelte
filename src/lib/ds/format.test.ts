import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { ago, comma, compact, MISSING, pct, shortAddr, usd } from './format.ts';

describe('missing input renders the em dash, never 0', () => {
	for (const bad of [NaN, null, undefined, Infinity, -Infinity]) {
		test(`${bad}`, () => {
			assert.equal(compact(bad), MISSING);
			assert.equal(comma(bad), MISSING);
			assert.equal(usd(bad), MISSING);
			assert.equal(pct(bad), MISSING);
		});
	}
	test('ago and shortAddr', () => {
		assert.equal(ago(null), MISSING);
		assert.equal(ago(undefined), MISSING);
		assert.equal(ago('not a date'), MISSING);
		assert.equal(ago(NaN), MISSING);
		assert.equal(shortAddr(null), MISSING);
		assert.equal(shortAddr(''), MISSING);
	});
});

describe('compact', () => {
	test('zero', () => assert.equal(compact(0), '0'));
	test('keeps full digits under 1e4', () => {
		assert.equal(compact(9999), '9,999');
		assert.equal(compact(1234.567), '1,234.57');
	});
	test('1e4 boundary switches to k', () => {
		assert.equal(compact(10_000), '10k');
		assert.equal(compact(576_100), '576.1k');
	});
	test('1e6 boundary switches to M', () => {
		assert.equal(compact(999_999), '1M');
		assert.equal(compact(1_000_000), '1M');
		assert.equal(compact(55_940_000), '55.94M');
		assert.equal(compact(139_592_135.918867), '139.59M');
	});
	test('1e9 boundary switches to B', () => {
		assert.equal(compact(999_999_999), '1B');
		assert.equal(compact(1_000_000_000), '1B');
		assert.equal(compact(10_000_000_000), '10B');
	});
	test('decimals argument', () => {
		assert.equal(compact(576_123, 1), '576.1k');
		assert.equal(compact(55_940_000, 0), '56M');
	});
	test('negatives', () => {
		assert.equal(compact(-9999), '-9,999');
		assert.equal(compact(-55_940_000), '-55.94M');
		assert.equal(compact(-999_999), '-1M');
	});
});

describe('comma', () => {
	test('zero and grouping', () => {
		assert.equal(comma(0), '0');
		assert.equal(comma(1_234_567), '1,234,567');
		assert.equal(comma(1_234.5678, 2), '1,234.57');
	});
	test('negatives', () => assert.equal(comma(-1_234_567), '-1,234,567'));
});

describe('usd', () => {
	test('zero', () => assert.equal(usd(0), '$0.00'));
	test('two decimals from $0.01', () => {
		assert.equal(usd(0.01), '$0.01');
		assert.equal(usd(1234.5), '$1,234.50');
	});
	test('six decimals under $0.01', () => {
		assert.equal(usd(0.004213), '$0.004213');
		assert.equal(usd(0.00421337), '$0.004213');
		assert.equal(usd(0.005), '$0.005');
	});
	test('negatives', () => {
		assert.equal(usd(-12.3), '-$12.30');
		assert.equal(usd(-0.004213), '-$0.004213');
	});
	test('a tiny negative that rounds to zero has no sign', () => {
		assert.equal(usd(-0.0000001), '$0.00');
	});
});

describe('pct', () => {
	test('zero', () => assert.equal(pct(0), '0%'));
	test('values are already in percent units', () => {
		assert.equal(pct(16.039), '16.04%');
		assert.equal(pct(148, 0), '148%');
	});
	test('negatives', () => assert.equal(pct(-3.5), '-3.5%'));
	test('a tiny negative that rounds to zero has no sign', () => {
		assert.equal(pct(-0.004), '0%');
		assert.equal(comma(-0.3), '0');
		assert.equal(compact(-0.001), '0');
		assert.equal(compact(-0), '0');
	});
});

describe('ago', () => {
	const now = Date.UTC(2026, 9, 25, 12, 0, 0);
	test('just now', () => assert.equal(ago(now, now), 'just now'));
	test('seconds, minutes, hours, days', () => {
		assert.equal(ago(now - 42_000, now), '42s ago');
		assert.equal(ago(now - 5 * 60_000, now), '5m ago');
		assert.equal(ago(now - 3 * 3_600_000, now), '3h ago');
		assert.equal(ago(new Date(now - 2 * 86_400_000), now), '2d ago');
		assert.equal(ago(new Date(now - 60_000).toISOString(), now), '1m ago');
	});
	test('future dates', () => assert.equal(ago(now + 5 * 60_000, now), 'in 5m'));
});

describe('shortAddr', () => {
	const addr = 'G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ';
	test('keeps the head and tail', () => assert.equal(shortAddr(addr), 'G3MSA7…UIFQ'));
	test('short strings pass through', () => assert.equal(shortAddr('ABCDEFGHIJK'), 'ABCDEFGHIJK'));
});
