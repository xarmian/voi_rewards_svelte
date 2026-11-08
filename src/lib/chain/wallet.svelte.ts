// The app's one seam onto avm-wallet-svelte 3.x (TASK-138).
//
// The library keeps selection in a rune store (`walletStore`) and signs for an explicit
// `{ address, walletId }`. The app reads the selection as a Svelte store in many places, and those
// reads carry the TASK-130/131/132 pinning behaviour, so they keep their meaning here:
// - `selectedWallet` / `connectedWallets` are readable stores in the 0.9 read shape. `app` is the
//   wallet id, or 'Watch' for a watch-only account. `walletId` rides along for the signer.
// - A store emits only when what it describes changed, so an unrelated account update never makes
//   a flow believe the picker moved.
// - `selectWallet` is the only writer of the selection, and it selects an exact (address, wallet)
//   pair, never the first address match.
// - `captureSigner` snapshots selection for vanity; `capturePageSigner` captures page membership.
//   Both freeze the exact pair for one confirmed attempt.
import { pageAccountState, wrongSignerMessage } from './signerGate';
import { readable } from 'svelte/store';
import { walletStore } from 'avm-wallet-svelte';
import type { ConnectedAccount, TransactionSigner } from 'avm-wallet-svelte';

export {
	signTransactions,
	signAndSendTransactions,
	SignerDisconnectedError,
	SignerTransactionMismatchError,
	SignerWatchOnlyError,
	SignerResultMismatchError,
	SignerSubmissionError
} from 'avm-wallet-svelte';
export type { TransactionSigner } from 'avm-wallet-svelte';

export type Wallet = {
	address: string;
	app: string;
	walletId: ConnectedAccount['walletId'];
	name?: string;
};

function toWallet(account: ConnectedAccount): Wallet {
	return {
		address: account.address,
		app: account.isWatch ? 'Watch' : account.walletId,
		walletId: account.walletId,
		name: account.name
	};
}

function sameWallet(a: Wallet | null, b: Wallet | null): boolean {
	if (a === null || b === null) return a === b;
	return (
		a.address === b.address && a.walletId === b.walletId && a.app === b.app && a.name === b.name
	);
}

function sameWallets(a: Wallet[], b: Wallet[]): boolean {
	return a.length === b.length && a.every((wallet, i) => sameWallet(wallet, b[i]));
}

// Bridges a rune read into a readable store. The first value is read synchronously, so `get()`
// works with no effect flush; later values arrive from one effect and are dropped when equal.
function bridge<T>(read: () => T, equal: (a: T, b: T) => boolean) {
	return readable<T>(read(), (set) => {
		let last = read();
		set(last);
		return $effect.root(() => {
			$effect(() => {
				const next = read();
				if (equal(last, next)) return;
				last = next;
				set(next);
			});
		});
	});
}

export const selectedWallet = bridge<Wallet | null>(() => {
	const account = walletStore.selectedAccount;
	return account ? toWallet(account) : null;
}, sameWallet);

export const connectedWallets = bridge<Wallet[]>(
	() => walletStore.accounts.map(toWallet),
	sameWallets
);

/** Select a connected (address, wallet) pair. A pair that is not connected is ignored. */
export function selectWallet(wallet: Pick<Wallet, 'address' | 'walletId'>): void {
	const account = walletStore.accounts.find(
		(candidate) => candidate.address === wallet.address && candidate.walletId === wallet.walletId
	);
	if (account) walletStore.selectAccount(account);
}

/** Snapshot the selected account as the signer for one confirmed attempt. */
export function captureSigner(): TransactionSigner {
	const account = walletStore.selectedAccount;
	if (!account) throw new Error('No account is selected.');
	if (account.isWatch) throw new Error('A watch-only account cannot sign.');
	return Object.freeze({ address: account.address, walletId: account.walletId });
}

/** Capture the first connected signing pair for the explicit page account. */
export function capturePageSigner(pageAddress: string | null | undefined): TransactionSigner {
	const state = pageAccountState(pageAddress, walletStore.accounts.map(toWallet));
	if (state.state !== 'yours') throw new Error(wrongSignerMessage());
	const account = state.signingEntry;
	return Object.freeze({ address: account.address, walletId: account.walletId });
}
