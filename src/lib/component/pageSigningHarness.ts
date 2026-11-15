import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { vi } from 'vitest';
import { pageAccountState, signerMatchesAccount, wrongSignerMessage } from '$lib/chain/signerGate';
export function handlerSource(component: string, names: string[]) {
	const source = readFileSync(new URL(`./${component}.svelte`, import.meta.url), 'utf8');
	return names
		.map((name) => {
			const body = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\t\\}`))?.[0];
			if (!body) throw new Error(`Missing handler ${component}.${name}`);
			return body;
		})
		.join('\n');
}

export function signingHarness(component: string, name: string, captured = 'X') {
	const io = vi.fn(() => {
		throw new Error('Transaction construction was reached');
	});
	const capturePageSigner = vi.fn(() => Object.freeze({ address: captured, walletId: 'pera' }));
	const context = createContext({
		setTimeout: vi.fn(),
		clearTimeout: vi.fn(),
		console: { log: vi.fn(), error: vi.fn() },
		Error,
		Buffer,
		AbortController,
		pageAccountState,
		signerMatchesAccount,
		wrongSignerMessage,
		capturePageSigner,
		captureSigner: () =>
			Object.freeze({ address: context.$selectedWallet.address, walletId: 'pera' }),
		accountAddress: 'Y',
		pageAddress: 'Y',
		walletAddress: 'Y',
		walletId: 'Y',
		parentWalletAddress: name.includes('StakingContract') ? 'Y' : null,
		contractId: 1,
		contract: { owner: 'Y', contractId: 1 },
		accountState: { state: 'yours', signingEntry: { address: 'Y', app: 'pera', walletId: 'pera' } },
		canSignTransactions: true,
		$connectedWallets: [{ address: 'Y', app: 'pera', walletId: 'pera' }],
		$selectedWallet: { address: 'Y', app: 'pera' },
		isSending: false,
		isClaiming: false,
		isBulkClaiming: false,
		isApproving: false,
		isRevoking: null,
		signingPinned: false,
		error: null,
		bridgeError: null,
		optOutError: null,
		approvalError: null,
		claimingError: null,
		claimError: null,
		bulkClaimError: null,
		claimableTokensSummary: [
			{ token: { type: 'arc200', id: '1' }, approvals: [{ owner: 'OWNER', amount: '1' }] }
		],
		bridgeStatus: 'idle',
		isVoiToAlgorand: true,
		destinationAddress: 'DEST',
		destinationNetwork: 'algorand',
		amount: '1',
		recipients: [{ address: 'DEST', amount: '1' }],
		decimalToBaseUnits: () => 1n,
		withinBalance: () => true,
		isARC200Token: () => false,
		abi: { custom: {} },
		algodIndexer: {},
		loadClaimBuilder: async () => ({
			arc200: class {
				constructor() {
					io();
				}
			}
		}),
		selectedToken: { symbol: 'VOI', decimals: 6, algorandAssetId: '0', voiAssetId: '0' },
		feeAmount: 0,
		destinationAmount: 1,
		amountInAtomicUnits: 1000000,
		token: { type: 'arc200', id: '1' },
		approvals: [{ owner: 'OWNER', amount: '1' }],
		spenderAddress: 'SPENDER',
		approvalAmount: '1',
		tokenDecimals: 6,
		parseTokenAmount: () => 1n,
		flow: { pinned: false, pin: vi.fn(), current: () => 'Y' },
		tracker: {},
		pinTick: 0,
		pendingController: null,
		dispatch: vi.fn(),
		refreshTrigger: 0,
		onSuccess: vi.fn(),
		transactionStatus: 'idle',
		isLoading: false,
		txStatus: 'idle',
		withdrawAmountVOI: 1,
		availableBalanceVOI: 2,
		canOfferWithdraw: io,
		algosdk: { isValidAddress: () => true },
		algodClient: { getTransactionParams: () => ({ do: io }), sendRawTransaction: io },
		buildPayment: io,
		buildAssetTransfer: io,
		buildCombinedPayment: io,
		buildWalletKeyregTxn: io,
		arc200Approve: io,
		arc200RevokeApproval: io,
		arc200TransferFrom: io,
		CONTRACT: io,
		signTransactions: io,
		signAndSendTransactions: io,
		sendWalletKeyreg: io
	});
	const names = component === 'RegisterVoteKey' ? ['signerOrError', name] : [name];
	runInContext(
		ts.transpileModule(
			handlerSource(component, names).replace("await import('ulujs')", 'await loadClaimBuilder()'),
			{
				compilerOptions: { target: ts.ScriptTarget.ES2022 }
			}
		).outputText,
		context
	);
	return {
		context,
		io,
		capturePageSigner,
		run: () =>
			runInContext(
				`${name}({transactionId: 'approval', spender: 'SPENDER', owner: 'OWNER', amount: '1'})`,
				context
			)
	};
}
