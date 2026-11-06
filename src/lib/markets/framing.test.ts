import { expect, it } from 'vitest';
import { quoteAsOfLabel } from './framing';

it.each([
	['2026-11-06T14:03:00Z', 'Data as of 2026-11-06 14:03 UTC'],
	['2026-11-07T00:03:00+10:00', 'Data as of 2026-11-06 14:03 UTC'],
	['2026-11-06T14:03:59.987Z', 'Data as of 2026-11-06 14:03 UTC']
])('formats quote timestamp %s as absolute UTC', (asOf, expected) => {
	expect(quoteAsOfLabel(asOf)).toBe(expected);
});

it.each([null, undefined, '', 'not a date'])('reports unavailable quote time for %s', (asOf) => {
	expect(quoteAsOfLabel(asOf)).toBe('Quote time unavailable');
});
