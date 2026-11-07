import { expect, test, vi } from 'vitest';
import { signingHarness } from './pageSigningHarness';
test('Bridge builds and signs from the page account while a different account was last used', async () => {
	const h = signingHarness('BridgeModal', 'handleSubmit', 'Y');
	h.context.$selectedWallet = { address: 'X', app: 'defly' };
	h.context.algodClient = { getTransactionParams: () => ({ do: async () => ({}) }) };
	h.context.BRIDGE_ADDRESS = 'BRIDGE';
	h.context.TextEncoder = TextEncoder;
	const build = vi.fn(() => ({ sender: 'Y' }));
	const sign = vi.fn().mockRejectedValue(new Error('Signing stopped for test'));
	h.context.buildPayment = build;
	h.context.signTransactions = sign;
	await h.run();
	expect(build).toHaveBeenCalledWith(expect.objectContaining({ from: 'Y' }));
	expect(sign).toHaveBeenCalledExactlyOnceWith([[{ sender: 'Y' }]], {
		address: 'Y',
		walletId: 'pera'
	});
});
