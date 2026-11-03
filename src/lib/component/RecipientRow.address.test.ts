import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import { nextLookupId, tokenKey } from '../chain/recipientInfo';

const source = readFileSync(new URL('./RecipientRow.svelte', import.meta.url), 'utf8');
const fn = (name: string) =>
	source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\t}`))?.[0] ?? '';

test('displays the same whole receiver used by Send transactions', () => {
	expect(source).toMatch(/<ResolvedAddress\s+address=\{recipient\.address\}/);
	expect(source).not.toMatch(/recipient\.address\.slice\(0, 8\)/);
	expect(source).toMatch(/<WalletSearch\s[^]*?onEdit=\{handleRecipientEdit\}/);
	expect(source).toContain('aria-label="View on explorer"');
	const send = readFileSync(new URL('./SendTokenModal.svelte', import.meta.url), 'utf8');
	for (const builder of ['buildVSATransaction', 'buildVOITransaction']) {
		const body = send.match(new RegExp(`async function ${builder}\\([^]*?\\n\\t}`))?.[0] ?? '';
		expect(body, 'Transaction helpers use their receiver argument').toContain(
			'to: recipientAddress'
		);
		expect(send, 'Each receiver argument comes from recipient.address').toMatch(
			new RegExp(`${builder}\\(\\s*token,\\s*sender,\\s*recipient\\.address,`)
		);
	}
	expect(send).toMatch(/address: recipient.address!/);
	expect(send).toMatch(/buildARC200Transaction\(token, sender, req.address,/);
	expect(send).toMatch(/arc200_transfer\(recipientAddress,/);
	// Combined payments retain the receiver from the already built payment.
	expect(send).toContain('to: algosdk.encodeAddress(firstPayment.to.publicKey)');
});
test('editing clears selection and drops an in-flight result for its old ticket', async () => {
	const handler = fn('handleRecipientEdit');
	expect(handler, 'Keep a named edit handler so selection invalidation can be exercised').not.toBe(
		''
	);
	const pending = Promise.withResolvers<unknown>();
	const recipient = {
		address: 'old',
		info: { balance: 123 },
		isValid: true,
		lookupError: 'old error',
		isLoading: false,
		lookupId: 0
	};
	const onError = vi.fn();
	const context = createContext({
		recipient,
		selectedToken: { type: 'native' },
		isNativeToken: () => true,
		loadRecipientInfo: () => pending.promise,
		nextLookupId,
		tokenKey,
		onError
	});
	runInContext(
		ts.transpileModule([handler, fn('fetchRecipientInfo')].join('\n'), {}).outputText,
		context
	);
	const loading = runInContext('fetchRecipientInfo("old")', context);
	const ticket = recipient.lookupId;
	runInContext('handleRecipientEdit()', context);
	expect(recipient).toMatchObject({
		address: null,
		info: null,
		isValid: false,
		lookupError: null,
		isLoading: false
	});
	expect(recipient.lookupId).toBeGreaterThan(ticket);
	expect(onError).toHaveBeenCalledExactlyOnceWith(null);
	const before = { ...recipient };
	pending.resolve({ status: 'loaded', info: { balance: 999 } });
	await loading;
	expect(recipient).toEqual(before);
	expect(onError).toHaveBeenCalledOnce();
});
