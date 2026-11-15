import { writeFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { render } from 'svelte/server';
vi.mock('$lib/chain/wallet.svelte', async () => {
	const { writable } = await import('svelte/store');
	return {
		connectedWallets: writable([]),
		selectedWallet: writable(null),
		selectWallet: vi.fn(),
		signTransactions: vi.fn(),
		signAndSendTransactions: vi.fn(),
		capturePageSigner: vi.fn()
	};
});
vi.mock('$lib/mimir', () => ({ mimirClient: {} }));
vi.mock('$lib/supabase', () => ({ supabasePublicClient: {} }));
vi.mock('$lib/utils/algod', () => ({ algodClient: {}, algodIndexer: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn() }));
vi.mock('$lib/wallet/load', () => ({ loadWallet: vi.fn() }));
vi.mock('avm-wallet-svelte', () => ({ Web3Wallet: () => {} }));
import { connectedWallets } from '$lib/chain/wallet.svelte';
import type { Writable } from 'svelte/store';
import type { Wallet } from '$lib/chain/wallet.svelte';
import { wrongSignerMessage } from '$lib/chain/signerGate';
import Page from './[...id]/+page.svelte';
import Portfolio from '$lib/component/PortfolioComponent.svelte';
import Node from '$lib/component/NodeComponent.svelte';
import Send from '$lib/component/SendTokenModal.svelte';
import Bridge from '$lib/component/BridgeModal.svelte';
import Withdraw from '$lib/component/WithdrawModal.svelte';
import OptOut from '$lib/component/OptOutModal.svelte';
import Approvals from '$lib/component/ManageApprovalsModal.svelte';
import Register from '$lib/component/RegisterVoteKey.svelte';
import Fungible from '$lib/component/FungibleToken.svelte';
import Claimable from '$lib/component/ClaimableTokenCard.svelte';
import Picker from '$lib/component/WalletPickerWordsFixture.svelte';
import Rewards from '$lib/ds/WalletRewards/WalletRewards.svelte';
import Contracts from '$lib/ds/WalletContracts/WalletContracts.svelte';
import { contractFixture } from '$lib/wallet/contracts.fixtures';
import { pageAccountState } from '$lib/chain/signerGate';
import Calculator from '$lib/component/CalculatorComponent.svelte';
import { tokens } from '$lib/ds/WalletHoldings/fixtures';

function visible(html: string) {
	const clean = html.replace(
		/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/g,
		''
	);
	const labels = [...clean.matchAll(/\b(?:title|placeholder|aria-label)="([^"]+)"/g)].map(
		(m) => m[1]
	);
	return [clean.replace(/<[^>]+>/g, ' '), ...labels]
		.join('\n')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();
}
test('all wallet surfaces use account and read-only wording', () => {
	vi.useFakeTimers();
	const audit: string[] = [];
	const names = new Set<string>();
	const add = (name: string, html: string) => {
		const text = visible(html);
		expect(text, name).not.toBe('');
		names.add(name);
		audit.push(`${name}: ${text}`);
	};
	const token = { ...tokens[0], type: 'arc200' as const };
	try {
		for (const entries of [
			[],
			[{ address: 'Y', app: 'Watch', walletId: 'watch' }],
			[{ address: 'Y', app: 'pera', walletId: 'pera' }],
			[{ address: 'X', app: 'pera', walletId: 'pera' }]
		]) {
			(connectedWallets as unknown as Writable<Wallet[]>).set(entries as Wallet[]);
			add('page', render(Page, { props: { data: { walletId: 'Y', parentWalletId: null } } }).body);
			add(
				'search',
				render(Page, { props: { data: { walletId: null, parentWalletId: null } } }).body
			);
			add(
				'contract',
				render(Page, { props: { data: { walletId: 'C', parentWalletId: 'Y' } } }).body
			);
			add('rewards', render(Rewards, { props: { pageAddress: 'Y' } }).body);
			for (const mode of ['overview', 'full'] as const) {
				add(
					`contracts-${mode}`,
					render(Contracts, {
						props: {
							contracts: [contractFixture(1, { owner: 'Y' })],
							current: null,
							pageAddress: 'Y',
							accountState: pageAccountState('Y', entries),
							state: 'ready',
							mode
						}
					}).body
				);
			}
			add(
				'contract-consensus',
				render(Node, { props: { walletId: 'C', parentWalletId: 'Y', contractId: 1 } }).body
			);
			add('holdings', render(Portfolio, { props: { walletAddress: 'Y' } }).body);
			add(
				'consensus',
				render(Node, { props: { walletId: 'Y', parentWalletId: null, contractId: null } }).body
			);
			add(
				'send',
				render(Send, {
					props: { open: true, accountAddress: 'Y', token, tokens: [token], onTokenSent: vi.fn() }
				}).body
			);
			add('bridge', render(Bridge, { props: { show: true, accountAddress: 'Y' } }).body);
			add(
				'withdraw',
				render(Withdraw, {
					props: {
						show: true,
						pageAddress: 'Y',
						contract: {
							owner: 'Y',
							contractId: 1,
							contractAddress: 'C',
							availableForWithdrawal: 1
						} as never,
						onSuccess: vi.fn()
					}
				}).body
			);
			add(
				'opt-out',
				render(OptOut, {
					props: { open: true, accountAddress: 'Y', token, onTokenOptedOut: vi.fn() }
				}).body
			);
			add('approvals', render(Approvals, { props: { open: true, walletId: 'Y', token } }).body);
			add(
				'registration',
				render(Register, {
					props: {
						pageAddress: 'Y',
						walletAddress: 'Y',
						parentWalletAddress: null,
						contractId: null,
						onSuccess: vi.fn()
					}
				}).body
			);
			add(
				'token',
				render(Fungible, { props: { walletId: 'Y', token, fungibleTokens: [token] } }).body
			);
			add(
				'claim',
				render(Claimable, {
					props: { walletId: 'Y', token, approvals: [], totalAmount: 1, totalValue: 1 }
				}).body
			);
		}
		add(
			'picker',
			render(Picker, {
				props: {
					accounts: [
						{ address: 'Y', walletId: 'pera', isWatch: false, authenticated: false },
						{ address: 'W', walletId: 'watch', isWatch: true, authenticated: false }
					]
				}
			}).body
		);
		add('calculator', render(Calculator, { props: { walletAddress: 'Y' } }).body);
		add('refusal', wrongSignerMessage());
		expect([...names].sort()).toEqual(
			[
				'page',
				'search',
				'contract',
				'holdings',
				'rewards',
				'contracts-overview',
				'contracts-full',
				'consensus',
				'contract-consensus',
				'send',
				'bridge',
				'withdraw',
				'opt-out',
				'approvals',
				'registration',
				'token',
				'claim',
				'picker',
				'refusal',
				'calculator'
			].sort()
		);
		const text = audit.join('\n');
		for (const surface of audit) {
			expect(
				surface.startsWith('calculator:')
					? surface.replaceAll('Quick Select', 'Quick amount')
					: surface
			).not.toMatch(/\b(?:selected|select|re-select)\b/i);
		}
		if (process.env.WALLET_WORDS_AUDIT) writeFileSync(process.env.WALLET_WORDS_AUDIT, text + '\n');
	} finally {
		vi.clearAllTimers();
		vi.useRealTimers();
	}
});
