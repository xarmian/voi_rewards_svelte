import { expect, test } from 'vitest';
import type { Recipient } from '../types/recipients';
import { applyRecipientLookup, nextLookupId, type RecipientInfoResult } from './recipientInfo';

function row(overrides: Partial<Recipient> = {}): Recipient {
	return {
		address: 'wallet',
		amount: '1',
		info: null,
		isValid: false,
		lookupError: null,
		isLoading: true,
		lookupId: 1,
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
	const updated = applyRecipientLookup([clone], 'wallet', 1, result);
	expect(clone).not.toBe(original);
	expect(updated[0]).not.toBe(clone);
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
	const updated = applyRecipientLookup([remaining], 'wallet', 1, loaded);
	expect(updated).toEqual([remaining]);
	expect(updated[0]).toBe(remaining);
	expect(applyRecipientLookup([], 'wallet', 1, loaded)).toEqual([]);
});

test('a row whose address changed is untouched', () => {
	const changed = row({ address: 'new' });
	expect(applyRecipientLookup([changed], 'wallet', 1, loaded)[0]).toBe(changed);
});

test('a row with the same address that is no longer loading is untouched', () => {
	const checked = row({ isLoading: false });
	expect(applyRecipientLookup([checked], 'wallet', 1, unavailable)[0]).toBe(checked);
});

test.each([loaded, unavailable])(
	'updates loading duplicates with the matching ticket for a $status result',
	(result) => {
		const rows = [row(), row({ amount: '2' })];
		const updated = applyRecipientLookup(rows, 'wallet', 1, result);
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
	const updated = applyRecipientLookup(rows, 'wallet', 1, loaded);
	expect(updated).not.toBe(rows);
	expect(rows).toEqual(before);
	expect(updated[0]).not.toBe(rows[0]);
	expect(updated[1]).toBe(rows[1]);
});

test.each([loaded, unavailable])(
	'a stale $status ticket preserves every row identity',
	(result) => {
		const rows = [row({ lookupId: 2 }), row({ address: 'other' }), row({ lookupId: undefined })];
		const updated = applyRecipientLookup(rows, 'wallet', 1, result);
		updated.forEach((recipient, index) => expect(recipient).toBe(rows[index]));
	}
);

test.each([loaded, unavailable])(
	'only the matching ticket settles same-address rows for a $status result',
	(result) => {
		const rows = [row({ lookupId: 2 }), row({ lookupId: 1 })];
		const updated = applyRecipientLookup(rows, 'wallet', 2, result);
		expect(updated[0]).toEqual({
			...rows[0],
			info: result.status === 'loaded' ? result.info : null,
			isValid: result.status === 'loaded',
			lookupError: result.status === 'unavailable' ? result.error : null,
			isLoading: false
		});
		expect(updated[0]).not.toBe(rows[0]);
		expect(updated[1]).toBe(rows[1]);
	}
);

test('invalidation keeps rows pending until their current ticket finishes', () => {
	const rows = [row(), row({ amount: '2' })].map((recipient) => ({
		...recipient,
		lookupId: 2,
		isValid: false,
		info: null,
		lookupError: null,
		isLoading: true
	}));
	const stale = applyRecipientLookup(rows, 'wallet', 1, loaded);
	stale.forEach((recipient, index) => expect(recipient).toBe(rows[index]));
	const current = applyRecipientLookup(stale, 'wallet', 2, loaded);
	for (const recipient of current) {
		expect(recipient.isValid).toBe(true);
		expect(recipient.isLoading).toBe(false);
		expect(recipient.info).toEqual(loaded.info);
	}
});

test('nextLookupId returns strictly increasing tickets', () => {
	const tickets = [nextLookupId(), nextLookupId(), nextLookupId()];
	expect(tickets[1]).toBeGreaterThan(tickets[0]);
	expect(tickets[2]).toBeGreaterThan(tickets[1]);
});
