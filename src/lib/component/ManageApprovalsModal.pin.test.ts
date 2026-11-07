import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { signingHarness } from './pageSigningHarness';

const source = readFileSync(new URL('./ManageApprovalsModal.svelte', import.meta.url), 'utf8');
test('an approval already in flight signs with its captured pair after a pick and a route change', async () => {
	const h = signingHarness('ManageApprovalsModal', 'handleCreateApproval', 'Y');
	let finish!: () => void;
	const pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const sign = vi.fn().mockResolvedValue([[1]]);
	const approve = vi.fn(async (_id, _spender, _amount, _sender, callback) => {
		await pending;
		await callback(['transaction']);
		return { success: true, txId: 'tx' };
	});
	h.context.arc200Approve = approve;
	h.context.signTransactions = sign;
	const attempt = h.run();
	expect(approve).toHaveBeenCalledOnce();
	h.context.walletId = 'Z';
	h.context.$selectedWallet = { address: 'Z', app: 'defly' };
	h.context.canSignTransactions = false;
	finish();
	await attempt;
	expect(sign).toHaveBeenCalledExactlyOnceWith([['transaction']], {
		address: 'Y',
		walletId: 'pera'
	});
	expect(h.context.approvalSuccess).toBe(true);
});
test('progress never grants permission for another approval', () => {
	expect(source).not.toContain('signingPinned');
});
