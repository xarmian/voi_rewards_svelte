import { describe, expect, it } from 'vitest';
import { httpStatus, pendingInfoFrom, roundNumber } from './algodShapes';

describe('httpStatus', () => {
	it('reads the status algosdk 3 keeps on error.response', () => {
		expect(httpStatus(Object.assign(new Error('x'), { response: { status: 404 } }))).toBe(404);
		expect(httpStatus({ response: { status: 400 } })).toBe(400);
	});
	it.each([
		['an error with no response', new Error('offline')],
		['the algosdk 2 field, which algosdk 3 no longer sets', { status: 404 }],
		['a response without a status', { response: {} }],
		['a non-numeric status', { response: { status: '404' } }],
		['a null response', { response: null }],
		['null', null],
		['a string', 'boom'],
		['undefined', undefined]
	])('has no status for %s', (_name, error) => {
		expect(httpStatus(error)).toBeUndefined();
	});
});

describe('roundNumber', () => {
	it('converts bigint rounds and keeps a missing round missing', () => {
		expect(roundNumber(99n)).toBe(99);
		expect(roundNumber(7)).toBe(7);
		expect(roundNumber(undefined)).toBeUndefined();
	});
});

describe('pendingInfoFrom', () => {
	it('reports a confirmed round as a number', () => {
		expect(pendingInfoFrom({ confirmedRound: 99n, poolError: '' })).toEqual({
			'confirmed-round': 99
		});
	});
	it('leaves the round out while the transaction is unconfirmed', () => {
		expect(pendingInfoFrom({ poolError: '' })).toEqual({});
	});
	it('reports a pool error only when there is one', () => {
		expect(pendingInfoFrom({ poolError: 'overspend' })).toEqual({ 'pool-error': 'overspend' });
	});
});
