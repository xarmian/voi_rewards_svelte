import { expect, test, vi } from 'vitest';
import { render } from 'svelte/server';
import { writable } from 'svelte/store';
vi.mock('$lib/chain/wallet.svelte', async () => {
	const { writable } = await import('svelte/store');
	return {
		connectedWallets: writable([]),
		selectedWallet: writable({ address: 'X', app: 'pera' }),
		signTransactions: vi.fn(),
		capturePageSigner: vi.fn()
	};
});
vi.mock('$lib/mimir', () => ({ mimirClient: {} }));
vi.mock('$lib/supabase', () => ({ supabasePublicClient: {} }));
vi.mock('$lib/utils/algod', () => ({ algodClient: {}, algodIndexer: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
// The existing cases cover the Bridge button with bridging on; one case below turns it off.
const bridge = vi.hoisted(() => ({ enabled: true }));
vi.mock('$lib/chain/bridgeAvailability', () => ({
	get BRIDGE_ENABLED() {
		return bridge.enabled;
	},
	hasPendingBridge: () => false
}));
import { connectedWallets } from '$lib/chain/wallet.svelte';
import Portfolio from './PortfolioComponent.svelte';
const entries = connectedWallets as ReturnType<typeof writable>;
test.each([[[]], [[{ address: 'X', app: 'pera' }]], [[{ address: 'Y', app: 'Watch' }]]])(
	'read-only holdings omit native signing controls for %j',
	(accounts) => {
		entries.set(accounts);
		const html = render(Portfolio, { props: { walletAddress: 'Y' } }).body;
		expect(html).not.toContain('Send VOI');
		expect(html).not.toContain('Bridge VOI');
		expect(html).not.toContain('Connect wallet to');
		expect(html).toContain('History');
	}
);
test('the page signer sees native actions independently of the last used account', () => {
	entries.set([{ address: 'Y', app: 'pera' }]);
	const html = render(Portfolio, { props: { walletAddress: 'Y' } }).body;
	expect(html).toContain('Bridge VOI');
	expect(html).toContain('Balance unavailable');
});

test('with bridging off the page signer gets no Bridge button without a bridge in flight', () => {
	bridge.enabled = false;
	try {
		entries.set([{ address: 'Y', app: 'pera' }]);
		const html = render(Portfolio, { props: { walletAddress: 'Y' } }).body;
		expect(html, 'the Send button renders for the page signer').toContain('Balance unavailable');
		expect(html).not.toContain('Bridge VOI');
		expect(html).not.toContain('Bridge status');
		expect(html).not.toContain('fa-bridge');
	} finally {
		bridge.enabled = true;
	}
});
