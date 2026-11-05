import { describe, expect, it } from 'vitest';
import algosdk from 'algosdk';
import {
	buildAssetTransfer,
	buildCombinedPayment,
	buildPayment,
	withNoteNoGroup
} from './txBuilders';
import { buildWalletKeyregTxn } from './keyreg';

// Golden bytes: the encoded unsigned transactions the app builds. They were captured on
// algosdk 2 before the move to algosdk 3 and must not change with it (TASK-145).

const addr = (n: number) => algosdk.encodeAddress(new Uint8Array(32).fill(n));
const A = addr(1);
const B = addr(2);
const C = addr(3);

// The same values the algosdk 2 capture used, in algosdk 3's parameter shape.
const params = {
	fee: 1000,
	minFee: 1000,
	flatFee: true,
	firstValid: 1000,
	lastValid: 2000,
	genesisHash: new Uint8Array(32).fill(7),
	genesisID: 'voimain-v1.0'
};

const note = new TextEncoder().encode('note-é');
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const UINT64_MAX = 2n ** 64n - 1n;

const b64 = (t: algosdk.Transaction) =>
	Buffer.from(algosdk.encodeUnsignedTransaction(t)).toString('base64');

const cases: Record<string, () => algosdk.Transaction> = {
	'payment zero': () => buildPayment({ from: A, to: B, amount: 0, suggestedParams: params }),
	'payment one with note': () =>
		buildPayment({ from: A, to: B, amount: 1n, note, suggestedParams: params }),
	'payment above 2^53': () =>
		buildPayment({ from: A, to: B, amount: MAX_SAFE + 2n, suggestedParams: params }),
	'payment uint64 max': () =>
		buildPayment({ from: A, to: B, amount: UINT64_MAX, suggestedParams: params }),
	'payment rekey to self': () =>
		buildPayment({ from: A, to: A, amount: 0, suggestedParams: params, rekeyTo: C }),
	'asset transfer above 2^53 with note': () =>
		buildAssetTransfer({
			from: A,
			to: B,
			assetIndex: 302190,
			amount: MAX_SAFE + 2n,
			note,
			suggestedParams: params
		}),
	'asset transfer zero': () =>
		buildAssetTransfer({ from: A, to: B, assetIndex: 395614, amount: 0, suggestedParams: params }),
	'asset opt-out': () =>
		buildAssetTransfer({
			from: A,
			to: A,
			assetIndex: 302190,
			amount: 0,
			suggestedParams: params,
			closeRemainderTo: A
		}),
	'combined payment': () =>
		buildCombinedPayment(
			buildPayment({ from: A, to: B, amount: 5n, note, suggestedParams: params }),
			MAX_SAFE + 10n
		),
	'combined payment without note': () =>
		buildCombinedPayment(buildPayment({ from: A, to: B, amount: 5n, suggestedParams: params }), 7n),
	'keyreg offline': () =>
		buildWalletKeyregTxn({
			sender: A,
			offline: true,
			params: { ...params, minFee: 1000 }
		}),
	'keyreg online': () =>
		buildWalletKeyregTxn({
			sender: A,
			offline: false,
			votingKey: Buffer.alloc(32, 1).toString('base64'),
			selectionKey: Buffer.alloc(32, 2).toString('base64'),
			stateProofKey: Buffer.alloc(64, 3).toString('base64'),
			firstRound: 1000,
			lastRound: 2000000,
			keyDilution: 1414,
			fee: null,
			params: { ...params, minFee: 1000 }
		}),
	'group of two': () => {
		const t1 = buildPayment({ from: A, to: B, amount: 1n, suggestedParams: params });
		const t2 = buildAssetTransfer({
			from: A,
			to: B,
			assetIndex: 302190,
			amount: 2n,
			suggestedParams: params
		});
		const grouped = algosdk.assignGroupID([t1, t2]);
		return grouped[1];
	}
};

// Filled in from the algosdk 2 run.
const GOLDEN: Record<string, string> = {
	'payment zero':
		'iKNmZWXNA+iiZnbNA+ijZ2VurHZvaW1haW4tdjEuMKJnaMQgBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBweibHbNB9CjcmN2xCACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqNzbmTEIAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBpHR5cGWjcGF5',
	'payment one with note':
		'iqNhbXQBo2ZlZc0D6KJmds0D6KNnZW6sdm9pbWFpbi12MS4womdoxCAHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHB6Jsds0H0KRub3RlxAdub3RlLcOpo3JjdsQgAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKjc25kxCABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAaR0eXBlo3BheQ==',
	'payment above 2^53':
		'iaNhbXTPACAAAAAAAAGjZmVlzQPoomZ2zQPoo2dlbqx2b2ltYWluLXYxLjCiZ2jEIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHomx2zQfQo3JjdsQgAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKjc25kxCABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAaR0eXBlo3BheQ==',
	'payment uint64 max':
		'iaNhbXTP//////////+jZmVlzQPoomZ2zQPoo2dlbqx2b2ltYWluLXYxLjCiZ2jEIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHomx2zQfQo3JjdsQgAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKjc25kxCABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAaR0eXBlo3BheQ==',
	'payment rekey to self':
		'iaNmZWXNA+iiZnbNA+ijZ2VurHZvaW1haW4tdjEuMKJnaMQgBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBweibHbNB9CjcmN2xCABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAaVyZWtlecQgAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwOjc25kxCABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAaR0eXBlo3BheQ==',
	'asset transfer above 2^53 with note':
		'i6RhYW10zwAgAAAAAAABpGFyY3bEIAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICo2ZlZc0D6KJmds0D6KNnZW6sdm9pbWFpbi12MS4womdoxCAHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHB6Jsds0H0KRub3RlxAdub3RlLcOpo3NuZMQgAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGkdHlwZaVheGZlcqR4YWlkzgAEnG4=',
	'asset transfer zero':
		'iaRhcmN2xCACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqNmZWXNA+iiZnbNA+ijZ2VurHZvaW1haW4tdjEuMKJnaMQgBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBweibHbNB9Cjc25kxCABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAaR0eXBlpWF4ZmVypHhhaWTOAAYJXg==',
	'asset opt-out':
		'iqZhY2xvc2XEIAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBpGFyY3bEIAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBo2ZlZc0D6KJmds0D6KNnZW6sdm9pbWFpbi12MS4womdoxCAHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHB6Jsds0H0KNzbmTEIAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBpHR5cGWlYXhmZXKkeGFpZM4ABJxu',
	'combined payment':
		'iqNhbXTPACAAAAAAAAmjZmVlzQPoomZ2zQPoo2dlbqx2b2ltYWluLXYxLjCiZ2jEIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHomx2zQfQpG5vdGXEB25vdGUtw6mjcmN2xCACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqNzbmTEIAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBpHR5cGWjcGF5',
	'combined payment without note':
		'iaNhbXQHo2ZlZc0D6KJmds0D6KNnZW6sdm9pbWFpbi12MS4womdoxCAHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHB6Jsds0H0KNyY3bEIAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICo3NuZMQgAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGkdHlwZaNwYXk=',
	'keyreg offline':
		'h6NmZWXNA+iiZnbNA+ijZ2VurHZvaW1haW4tdjEuMKJnaMQgBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBweibHbNB9Cjc25kxCABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAaR0eXBlpmtleXJlZw==',
	'keyreg online':
		'jaNmZWXNA+iiZnbNA+ijZ2VurHZvaW1haW4tdjEuMKJnaMQgBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBweibHbNB9Cmc2Vsa2V5xCACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqNzbmTEIAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBp3NwcmZrZXnEQAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwOkdHlwZaZrZXlyZWendm90ZWZzdM0D6KZ2b3Rla2TNBYandm90ZWtlecQgAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGndm90ZWxzdM4AHoSA',
	'group of two':
		'i6RhYW10AqRhcmN2xCACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqNmZWXNA+iiZnbNA+ijZ2VurHZvaW1haW4tdjEuMKJnaMQgBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwejZ3JwxCBNyvcELWXgUEBQgq97sbd1qC1gE+kIuSYtqaw/F1z9u6Jsds0H0KNzbmTEIAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBpHR5cGWlYXhmZXKkeGFpZM4ABJxu'
};

describe('golden transactions', () => {
	if (process.env.CAPTURE_GOLDEN) {
		it('prints the golden bytes', () => {
			const out: Record<string, string> = {};
			for (const [name, make] of Object.entries(cases)) out[name] = b64(make());
			console.log('GOLDEN_JSON=' + JSON.stringify(out));
		});
		return;
	}
	for (const [name, make] of Object.entries(cases)) {
		it(name, () => {
			expect(b64(make())).toBe(GOLDEN[name]);
		});
	}
	it('covers every case', () => {
		expect(Object.keys(GOLDEN).sort()).toEqual(Object.keys(cases).sort());
	});
});

describe('withNoteNoGroup', () => {
	const big = 2n ** 60n + 7n;
	const grouped = () => {
		const first = buildPayment({ from: A, to: B, amount: big, note, suggestedParams: params });
		const second = buildAssetTransfer({
			from: A,
			to: B,
			assetIndex: 302190,
			amount: 2n,
			suggestedParams: params
		});
		return algosdk.assignGroupID([first, second]);
	};

	it('replaces the note, drops the group id and keeps every other field exactly', () => {
		const [first] = grouped();
		expect(first.group).toBeDefined();
		const rebuilt = withNoteNoGroup(first, new TextEncoder().encode('7'));
		const direct = buildPayment({
			from: A,
			to: B,
			amount: big,
			note: new TextEncoder().encode('7'),
			suggestedParams: params
		});
		expect(rebuilt.group).toBeUndefined();
		expect(rebuilt.payment?.amount).toBe(big);
		expect(b64(rebuilt)).toBe(b64(direct));
	});

	it('keeps the existing note when none is given', () => {
		const [first] = grouped();
		const rebuilt = withNoteNoGroup(first);
		expect(new TextDecoder().decode(rebuilt.note)).toBe('note-é');
		expect(rebuilt.group).toBeUndefined();
	});

	it('works on an asset transfer and leaves the original untouched', () => {
		const [first, second] = grouped();
		const rebuilt = withNoteNoGroup(second, new TextEncoder().encode('n'));
		expect(rebuilt.assetTransfer?.amount).toBe(2n);
		expect(rebuilt.assetTransfer?.assetIndex).toBe(302190n);
		expect(rebuilt.group).toBeUndefined();
		expect(second.group).toBeDefined();
		expect(first.group).toEqual(second.group);
	});
});

describe('withNoteNoGroup on an application call', () => {
	// The ARC-200 transactions SendTokenModal rebuilds are application calls with app args, accounts,
	// foreign references and boxes, none of which the payment cases above exercise.
	const appCall = (callNote?: Uint8Array) =>
		algosdk.makeApplicationNoOpTxnFromObject({
			sender: A,
			appIndex: 40153368,
			appArgs: [Uint8Array.of(1, 2, 3), Uint8Array.of(9)],
			accounts: [B, C],
			foreignApps: [390001],
			foreignAssets: [302190],
			boxes: [{ appIndex: 0, name: Uint8Array.of(7, 7) }],
			note: callNote,
			suggestedParams: params
		});

	it('keeps every call field and replaces only the note and group', () => {
		const grouped = algosdk.assignGroupID([
			appCall(note),
			buildPayment({ from: A, to: B, amount: 1n, suggestedParams: params })
		]);
		const rebuilt = withNoteNoGroup(grouped[0], new TextEncoder().encode('3'));
		expect(rebuilt.group).toBeUndefined();
		expect(b64(rebuilt)).toBe(b64(appCall(new TextEncoder().encode('3'))));
	});

	it('keeps the whole call when no note is given', () => {
		const [call] = algosdk.assignGroupID([
			appCall(note),
			buildPayment({ from: A, to: B, amount: 1n, suggestedParams: params })
		]);
		expect(b64(withNoteNoGroup(call))).toBe(b64(appCall(note)));
	});
});

describe('regrouping transactions that arrive already grouped', () => {
	// PortfolioComponent merges transactions the server grouped separately into one batch: it clears
	// each group id, then calls assignGroupID. That needs assignGroupID to hash the ungrouped
	// transactions and to set the new id on the same objects it returns.
	const make = (amount: number) =>
		buildPayment({ from: A, to: B, amount, suggestedParams: params });
	const same = (a?: Uint8Array, b?: Uint8Array) => !!a && !!b && Buffer.compare(a, b) === 0;

	it('gives the merged batch the group id of its ungrouped transactions', () => {
		const groupA = algosdk.assignGroupID([make(1), make(2)]);
		const groupB = algosdk.assignGroupID([make(3), make(4)]);
		const decoded = [...groupA, ...groupB].map((t) =>
			algosdk.decodeUnsignedTransaction(algosdk.encodeUnsignedTransaction(t))
		);
		for (const t of decoded) delete t.group;
		const returned = algosdk.assignGroupID(decoded);

		const expected = algosdk.computeGroupID([make(1), make(2), make(3), make(4)]);
		expect(returned).toBe(decoded);
		for (const t of decoded) expect(same(t.group, expected)).toBe(true);
		expect(same(decoded[0].group, groupA[0].group)).toBe(false);
	});
});
