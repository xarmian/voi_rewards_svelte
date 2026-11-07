import { expect, test, vi } from 'vitest';
import { render } from 'svelte/server';
import { get, writable } from 'svelte/store';
vi.mock('$lib/chain/wallet.svelte', async () => {
	const { writable } = await import('svelte/store');
	return {
		selectedWallet: writable({ address: 'X', app: 'pera', walletId: 'pera' }),
		connectedWallets: writable([]),
		selectWallet: vi.fn()
	};
});
vi.mock('$lib/mimir', () => ({ mimirClient: {} }));
vi.mock('$lib/supabase', () => ({ supabase: {} }));
vi.mock('$lib/utils/algod', () => ({ algodClient: {}, algodIndexer: {} }));
vi.mock('$lib/wallet/load', () => ({ loadWallet: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn() }));
vi.mock('avm-wallet-svelte', () => ({ Web3Wallet: () => {} }));
import { connectedWallets, selectedWallet } from '$lib/chain/wallet.svelte';
import Page from './[...id]/+page.svelte';
const connected = connectedWallets as ReturnType<typeof writable>;
test.each([
	[[], 'Read-only', 'Read-only. Connect a wallet to act on your own accounts.'],
	[
		[{ address: 'X', app: 'pera', walletId: 'pera' }],
		'Read-only',
		"Read-only. This isn't one of your connected accounts."
	],
	[
		[{ address: 'Y', app: 'Watch', walletId: 'watch' }],
		'Watch only',
		'Read-only. This account is connected for watching only.'
	],
	[[{ address: 'Y', app: 'pera', walletId: 'pera' }], 'Your account', null]
])('page identity and explanation follow connected membership %j', (accounts, pill, line) => {
	connected.set(accounts);
	const html = render(Page, { props: { data: { walletId: 'Y', parentWalletId: null } } }).body;
	expect(html).toContain(pill);
	if (line) expect(html.replaceAll('&#39;', "'")).toContain(line);
	expect(get(selectedWallet)?.address).toBe('X');
});
test('a contract owned by a connected signer links to its account without offering signing actions', () => {
	connected.set([{ address: 'OWNER', app: 'pera', walletId: 'pera', name: 'Alice' }]);
	const html = render(Page, {
		props: { data: { walletId: 'CONTRACT', parentWalletId: 'OWNER' } }
	}).body;
	expect(html).toContain('This contract belongs to your account');
	expect(html).toContain('Alice');
	expect(html).toContain('href="/wallet/OWNER"');
	expect(html).not.toMatch(/Register (?:a |participation )?key|Send VOI|Bridge VOI/);
});
test('bare wallet renders search even while another account is connected', () => {
	for (const accounts of [[], [{ address: 'X', app: 'pera', walletId: 'pera' }]]) {
		connected.set(accounts);
		const html = render(Page, { props: { data: { walletId: null, parentWalletId: null } } }).body;
		expect(html).toContain('Check a wallet');
		expect(html).toContain('Recent wallets');
		expect(html).not.toContain('Wallet sections');
	}
});
