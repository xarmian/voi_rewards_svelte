import { expect, test } from 'vitest';
import type { Recipient } from '../types/recipients';
import { applyRecipientLookup, type RecipientInfoResult } from './recipientInfo';

function row(overrides: Partial<Recipient> = {}): Recipient {
	return {
		address: 'wallet',
		amount: '1',
		info: null,
		isValid: false,
		lookupError: null,
		isLoading: true,
		...overrides
	};
}

const loaded: RecipientInfoResult = {
	status: 'loaded',
	info: { balance: 123, hasOptedIn: true, assetBalance: 42 }
};
const unavailable: RecipientInfoResult = { status: 'unavailable', error: 'algod offline' };

test.each([loaded, unavailable])('updates a cloned loading row for a $status result', (result) => {
	const original = row({
		info: { balance: 999, hasOptedIn: false },
		isValid: true,
		lookupError: 'previous error'
	});
	const clone = { ...original };
	const updated = applyRecipientLookup([clone], 'wallet', result);
	expect(clone).not.toBe(original);
	expect(updated[0]).toEqual({
		...clone,
		info: result.status === 'loaded' ? result.info : null,
		isValid: result.status === 'loaded',
		lookupError: result.status === 'unavailable' ? result.error : null,
		isLoading: false
	});
});

test('a removed row changes nothing', () => {
	const remaining = row({ address: 'other' });
	const updated = applyRecipientLookup([remaining], 'wallet', loaded);
	expect(updated).toEqual([remaining]);
	expect(updated[0]).toBe(remaining);
	expect(applyRecipientLookup([], 'wallet', loaded)).toEqual([]);
});

test('a row whose address changed is untouched', () => {
	const changed = row({ address: 'new' });
	expect(applyRecipientLookup([changed], 'wallet', loaded)[0]).toBe(changed);
});

test('a row with the same address that is no longer loading is untouched', () => {
	const checked = row({ isLoading: false });
	expect(applyRecipientLookup([checked], 'wallet', unavailable)[0]).toBe(checked);
});

test.each([loaded, unavailable])(
	'updates every loading duplicate for a $status result',
	(result) => {
		const rows = [row(), row({ amount: '2' })];
		const updated = applyRecipientLookup(rows, 'wallet', result);
		for (const recipient of updated) {
			expect(recipient.isLoading).toBe(false);
			expect(recipient.isValid).toBe(result.status === 'loaded');
			expect(recipient.info).toEqual(result.status === 'loaded' ? result.info : null);
			expect(recipient.lookupError).toBe(result.status === 'unavailable' ? result.error : null);
		}
	}
);

test('returns a new array without mutating the input array or its rows', () => {
	const rows = [row(), row({ address: 'other' })];
	const before = structuredClone(rows);
	rows.forEach(Object.freeze);
	Object.freeze(rows);
	const updated = applyRecipientLookup(rows, 'wallet', loaded);
	expect(updated).not.toBe(rows);
	expect(rows).toEqual(before);
	expect(updated[0]).not.toBe(rows[0]);
	expect(updated[1]).toBe(rows[1]);
});
