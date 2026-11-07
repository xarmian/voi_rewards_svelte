import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { signerMatchesAccount, wrongSignerMessage } from '$lib/chain/signerGate';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');

test('signs every bulk claim batch as the captured signer, whatever the picker does', () => {
	const loop = source.slice(source.indexOf('for (const batch of transactionBatches)'));
	const beforeSign = loop.slice(0, loop.indexOf('await signTransactions('));
	// The old stop-when-the-selection-moved checks are gone: the signer is fixed at confirmation.
	expect(beforeSign).not.toContain('$selectedWallet');
	expect(loop).toContain('await signTransactions([grouped], signer)');
	expect(source).toContain('{bulkClaimError}');
});

test('stops the bulk claim on any signer error, with the library message', () => {
	// SIGNER_DISCONNECTED, SIGNER_WATCH_ONLY, SIGNER_TRANSACTION_MISMATCH and SIGNER_RESULT_MISMATCH
	// will not clear on the next batch, and each retry would prompt the user again.
	const loop = source.slice(source.indexOf('for (const batch of transactionBatches)'));
	const match = loop.indexOf("error.code.startsWith('SIGNER_')");
	expect(match).toBeGreaterThan(-1);
	expect(loop).toContain("typeof error.code === 'string'");
	expect(loop.slice(match, loop.indexOf('break;', match))).toContain(
		'bulkClaimError = error instanceof Error'
	);
});

test.each(['PortfolioComponent', 'OptOutModal'])(
	'%s shows a refused signer capture in its error area instead of throwing from the handler',
	(component) => {
		const text = readFileSync(new URL(`./${component}.svelte`, import.meta.url), 'utf8');
		// The stores can lag the rune store by a tick, so a guard can pass and the capture still refuse.
		const capture = text.indexOf(
			'signer = capturePageSigner(target);'
		);
		expect(capture).toBeGreaterThan(-1);
		expect(text.slice(capture - 40, capture)).toMatch(/try \{\s*$/);
		const catchBody = text.slice(capture, text.indexOf('return;', capture));
		expect(catchBody).toMatch(/(optOutError|bulkClaimError) = captureError instanceof Error/);
	}
);

test.each(['FungibleToken', 'ClaimableTokenCard', 'RegisterVoteKey', 'OptOutModal'])(
	'%s has no live selection reads after its signing call',
	(component) => {
		const text = readFileSync(new URL(`./${component}.svelte`, import.meta.url), 'utf8');
		const functions = [...text.matchAll(/\tasync function \w+\([^]*?\n\t\}/g)].map(
			(match) => match[0]
		);
		const signing = functions.filter((body) =>
			/(?:signTransactions|signAndSendTransactions|sendWalletKeyreg)\(/.test(body)
		);
		expect(signing.length).toBeGreaterThan(0);
		for (const body of signing) {
			const index = body.search(/(?:signTransactions|signAndSendTransactions|sendWalletKeyreg)\(/);
			expect(body.slice(index)).not.toContain('$selectedWallet');
		}
	}
);

test('bulk claim captures its signer before any await and refuses a page without signing membership', () => {
	const start = source.indexOf('async function bulkClaimAllTokens()');
	const fn = source.slice(start, source.indexOf('\n\t}\n', start));
	const capture = fn.indexOf('capturePageSigner(target)');
	expect(capture).toBeGreaterThan(0);
	expect(capture).toBeLessThan(fn.indexOf('await '));
	// The page must be connected in a signing wallet.
	const guard = fn.slice(0, capture);
	expect(guard).toContain("pageAccountState(walletAddress, $connectedWallets).state === 'yours'");
	expect(fn).toMatch(/const claimAccount = signer\.address;/);
});

test('bulk claim refuses a signer that is not the account the page claims for, before building', () => {
	// The readable store can lag the rune store by a tick, so the guard can pass for account A while
	// capturePageSigner returns B. The claims are built for A's approvals from claimAccount: a signer that
	// is not A must stop the run before any transaction is built, or the sender would follow the
	// signer instead of the account the user confirmed.
	const start = source.indexOf('async function bulkClaimAllTokens()');
	const fn = source.slice(start, source.indexOf('\n\t}\n', start));
	const capture = fn.indexOf('capturePageSigner(target)');
	// The whole statement, so a neutralised condition (`false && …`) does not satisfy it.
	const statement = /\n\t\tif \(!signerMatchesAccount\(signer, target\)\) \{\n/.exec(fn);
	expect(statement).not.toBeNull();
	const check = statement?.index ?? -1;
	const marker = fn.indexOf('const claimAccount = signer.address;');
	expect(check).toBeGreaterThan(capture);
	expect(marker).toBeGreaterThan(check);
	expect(check).toBeLessThan(fn.indexOf('await '));
	const refusal = fn.slice(check, fn.indexOf('return;', check));
	expect(refusal).toContain('bulkClaimError = wrongSignerMessage()');
});

test('bulk claim builds its transactions from the captured account, not the live route address', () => {
	const start = source.indexOf('async function bulkClaimAllTokens()');
	const fn = source.slice(start, source.indexOf('\n\t}\n', start));
	const marker = 'const claimAccount = signer.address;';
	expect(fn).toContain(marker);
	const afterCapture = fn.slice(fn.indexOf(marker) + marker.length);
	expect(afterCapture).not.toMatch(/\bwalletAddress\b/);
});

test('each bulk claim result names the account that signed it', () => {
	const start = source.indexOf('async function bulkClaimAllTokens()');
	const fn = source.slice(start, source.indexOf('\n\t}\n', start));
	expect(fn.match(/wallet: claimAccount/g)).toHaveLength(2);
});

test.each(['Y', undefined])(
	'opt-out requires the page account %j before building',
	async (accountAddress) => {
		const text = readFileSync(new URL('./OptOutModal.svelte', import.meta.url), 'utf8');
		const handler = text.match(/async function handleOptOut\([^]*?\n\t\}/)?.[0];
		expect(handler).toBeDefined();
		for (const selected of ['X', 'Y']) {
			const buildAssetTransfer = vi.fn().mockReturnValue({});
			const buildPayment = vi.fn();
			const buildCombinedPayment = vi.fn();
			const signTransactions = vi.fn().mockResolvedValue([[1]]);
			const sendRawTransaction = vi.fn(() => ({ do: async () => ({ txid: 'tx' }) }));
			const context = createContext({
				accountAddress,
				signerMatchesAccount,
				wrongSignerMessage,
				$selectedWallet: { address: selected, app: 'Pera' },
				canSignTransactions: true,
				capturePageSigner: () => ({ address: selected }),
				captureSigner: () => ({ address: selected }),
				buildAssetTransfer,
				buildPayment,
				buildCombinedPayment,
				signTransactions,
				algodClient: { getTransactionParams: () => ({ do: async () => ({}) }), sendRawTransaction },
				algosdk: { waitForConfirmation: vi.fn() },
				token: { id: '1' },
				optOutError: null,
				optOutSuccess: false,
				onTokenOptedOut: vi.fn(),
				setTimeout: vi.fn()
			});
			runInContext(ts.transpileModule(handler!, {}).outputText, context);
			await runInContext('handleOptOut()', context);
			if (selected !== accountAddress) {
				expect(context.optOutError).toBe(wrongSignerMessage());
				for (const call of [
					buildAssetTransfer,
					buildPayment,
					buildCombinedPayment,
					signTransactions,
					sendRawTransaction
				]) {
					expect(call).not.toHaveBeenCalled();
				}
			} else {
				expect(context.optOutError).toBeNull();
				expect(buildAssetTransfer).toHaveBeenCalledWith(
					expect.objectContaining({ from: 'Y', to: 'Y', closeRemainderTo: 'Y' })
				);
				expect(signTransactions).toHaveBeenCalledWith([[{}]], { address: 'Y' });
				expect(sendRawTransaction).toHaveBeenCalledOnce();
				expect(context.optOutSuccess).toBe(true);
			}
		}
	}
);

test.each(['OptOutModal', 'SendTokenModal'])(
	'%s labels the page signer without a selection banner',
	(component) => {
		const text = readFileSync(new URL(`./${component}.svelte`, import.meta.url), 'utf8');
		expect(text).toContain('Signing account:');
		expect(text).not.toContain('selectedWallet');
		expect(text).toContain('{#if canSignTransactions}<Button');
	}
);

test('every send and opt-out mount receives the displayed account', () => {
	const fungible = readFileSync(new URL('./FungibleToken.svelte', import.meta.url), 'utf8');
	for (const name of ['OptOutModal', 'SendTokenModal']) {
		expect(fungible.match(new RegExp(`<${name}\\b[^]*?/>`))?.[0]).toMatch(
			/accountAddress=\{walletId\}/
		);
	}
	expect(source.match(/<svelte:component\s+this=\{SendTokenModal\}[^]*?\/>/)?.[0]).toMatch(
		/accountAddress=\{walletAddress\}/
	);
});
