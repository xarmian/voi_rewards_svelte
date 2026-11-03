import algosdk from 'algosdk';
import { expect, test } from 'vitest';
import { capturePlan, selectionDrifted } from './vanityPlan';

const funder = algosdk.encodeAddress(new Uint8Array(32));
const vanity = algosdk.encodeAddress(new Uint8Array(32).fill(1));
const selected = { address: funder, app: 'Pera' };

test.each([null, undefined, { ...selected, app: 'Watch' }])(
	'rejects a missing or watch selection: %j',
	(wallet) => {
		expect(capturePlan(wallet, vanity)).toEqual({
			ok: false,
			error: 'Please connect a wallet first'
		});
	}
);

test('requires a generated vanity address', () => {
	expect(capturePlan(selected, undefined)).toEqual({
		ok: false,
		error: 'Generate a vanity address first'
	});
});

test.each([
	[{ ...selected, address: 'invalid' }, vanity],
	[selected, 'invalid'],
	[{ ...selected, address: `${funder.slice(0, -1)}A` }, vanity],
	[selected, `${vanity.slice(0, -1)}A`]
])('rejects invalid addresses including bad checksums', (wallet, address) => {
	expect(capturePlan(wallet, address)).toMatchObject({ ok: false, error: expect.any(String) });
});

test('captures independent funder, rekey target and vanity values', () => {
	const wallet = { ...selected };
	const captured = capturePlan(wallet, vanity);
	expect(captured).toEqual({ ok: true, plan: { funder, rekeyTo: funder, vanity } });
	wallet.address = vanity;
	if (!captured.ok) throw new Error(captured.error);
	expect(captured.plan.rekeyTo).toBe(funder);
	expect(selectionDrifted(captured.plan, selected)).toBe(false);
	expect(selectionDrifted(captured.plan, { ...selected, app: 'Defly' })).toBe(false);
	expect(selectionDrifted(captured.plan, wallet)).toBe(true);
	expect(selectionDrifted(captured.plan, undefined)).toBe(true);
	expect(selectionDrifted(captured.plan, null)).toBe(true);
});
