import { describe, expect, it } from 'vitest';
import { readPriceHistory } from './priceHistory';

const points = [
	{ time: '2026-01-01T00:00:00Z', value: 0.01 },
	{ time: '2026-01-01T01:00:00Z', value: 0.02 }
];

describe('readPriceHistory', () => {
	it('returns the body of an OK array response', async () => {
		expect(await readPriceHistory(Response.json(points))).toEqual(points);
	});

	it('returns [] for an OK response whose body is not an array', async () => {
		expect(await readPriceHistory(Response.json({ points }))).toEqual([]);
	});

	it('returns [] for an error response with a JSON error body', async () => {
		const response = new Response(JSON.stringify({ error: 'Failed to fetch price history' }), {
			status: 500
		});
		expect(await readPriceHistory(response)).toEqual([]);
	});

	it('returns [] for an error response whose body is an array', async () => {
		expect(await readPriceHistory(Response.json(points, { status: 502 }))).toEqual([]);
	});

	it('returns [] for an OK response with invalid JSON', async () => {
		expect(await readPriceHistory(new Response('not json'))).toEqual([]);
	});
});
