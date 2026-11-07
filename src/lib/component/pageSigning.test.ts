import { expect, test, vi } from 'vitest';
import { signingHarness } from './pageSigningHarness';
const refusal = "This page's account isn't connected in a signing wallet. Nothing was signed.";
const paths = [
	['SendTokenModal', 'handleSend', 'error'],
	['BridgeModal', 'handleSubmit', 'bridgeError'],
	['WithdrawModal', 'handleWithdraw', 'error'],
	['OptOutModal', 'handleOptOut', 'optOutError'],
	['ManageApprovalsModal', 'handleCreateApproval', 'approvalError'],
	['ManageApprovalsModal', 'handleRevokeApproval', 'approvalError'],
	['RegisterVoteKey', 'registerStakingContractVoteKey', 'error'],
	['RegisterVoteKey', 'registerWalletVoteKey', 'error'],
	['RegisterVoteKey', 'goOfflineWalletVoteKey', 'error'],
	['RegisterVoteKey', 'goOfflineStakingContractVoteKey', 'error'],
	['PortfolioComponent', 'bulkClaimAllTokens', 'bulkClaimError'],
	['FungibleToken', 'claimTokens', 'claimingError'],
	['ClaimableTokenCard', 'handleClaim', 'claimError']
] as const;

test.each(paths)(
	'%s %s refuses a captured account different from its own page before construction',
	async (component, name, errorKey) => {
		const h = signingHarness(component, name);
		await h.run();
		expect(h.context[errorKey]).toBe(refusal);
		expect(h.capturePageSigner).toHaveBeenCalledExactlyOnceWith('Y');
		expect(h.io).not.toHaveBeenCalled();
	}
);

test.each(paths)(
	'%s %s refuses when the page signer disappears after render',
	async (component, name, errorKey) => {
		const h = signingHarness(component, name, 'Y');
		h.capturePageSigner.mockImplementation(() => {
			throw new Error(refusal);
		});
		await h.run();
		expect(h.context[errorKey]).toBe(refusal);
		expect(h.capturePageSigner).toHaveBeenCalledExactlyOnceWith('Y');
		expect(h.io).not.toHaveBeenCalled();
	}
);

test.each(paths)(
	'%s %s compares capture with the page at the start of the attempt',
	async (component, name, errorKey) => {
		const h = signingHarness(component, name);
		h.capturePageSigner.mockImplementation(() => {
			for (const prop of ['accountAddress', 'pageAddress', 'walletAddress', 'walletId'])
				h.context[prop] = 'X';
			if (h.context.parentWalletAddress) h.context.parentWalletAddress = 'X';
			h.context.contract.owner = 'X';
			return Object.freeze({ address: 'X', walletId: 'pera' });
		});
		await h.run();
		expect(h.context[errorKey]).toBe(refusal);
		expect(h.capturePageSigner).toHaveBeenCalledExactlyOnceWith('Y');
		expect(h.io).not.toHaveBeenCalled();
	}
);

test.each(['registerStakingContractVoteKey', 'goOfflineStakingContractVoteKey'])(
	'%s refuses a row whose owner is not the page',
	async (name) => {
		const h = signingHarness('RegisterVoteKey', name, 'Y');
		h.context.parentWalletAddress = 'OWNER';
		await h.run();
		expect(h.context.error).toBe(refusal);
		expect(h.io).not.toHaveBeenCalled();
	}
);

test('withdraw refuses a row whose owner is not the page', async () => {
	const h = signingHarness('WithdrawModal', 'handleWithdraw', 'Y');
	h.context.contract.owner = 'OWNER';
	await h.run();
	expect(h.context.error).toBe(refusal);
	expect(h.io).not.toHaveBeenCalled();
});


test.each(paths)('%s %s signs with the page pair while another account was last used', async (component, name) => {
 const h = signingHarness(component, name, 'Y');
 const c = h.context;
 c.$selectedWallet = {address: 'X', app: 'defly'};
 const txn = {sender: 'Y', txID: () => 'tx'};
 const sign = vi.fn(async () => { throw new Error('Mock signing complete'); });
 c.signTransactions = sign;
 c.signAndSendTransactions = sign;
 c.algodClient = {getTransactionParams: () => ({do: async () => ({})})};
 c.algosdk = {...c.algosdk, decodeUnsignedTransaction: () => txn, assignGroupID: (txns: unknown) => txns};
 c.BRIDGE_ADDRESS = 'BRIDGE';
 c.TextEncoder = TextEncoder;
 c.buildPayment = vi.fn((args: {from: string}) => {expect(args.from).toBe('Y'); return txn;});
 c.buildAssetTransfer = vi.fn((args: {from: string}) => {expect(args.from).toBe('Y'); return txn;});
 c.buildWalletKeyregTxn = vi.fn((args: {sender: string}) => {expect(args.sender).toBe('Y'); return txn;});
 c.sendWalletKeyreg = async (_txn: unknown, deps: {signAndSend: (groups: unknown) => Promise<unknown>}) => deps.signAndSend([[txn]]);
 c.recipients = [{address: 'DEST', amount: '1'}];
 c.decimalToBaseUnits = () => 1n;
 c.withinBalance = () => true;
 c.isARC200Token = () => false;
 c.isNativeToken = () => true;
 c.MAX_TXN_PER_GROUP = 16;
 c.MAX_GROUPS_PER_SIGNING = 16;
 c.buildVOITransaction = vi.fn((_token: unknown, sender: string) => {expect(sender).toBe('Y'); return txn;});
 c.canOfferWithdraw = () => true;
 c.VOIToMicroVOI = () => 1000000;
 c.sendDeps = {};
 c.sendWithdrawal = async (_args: unknown, deps: {sign: (groups: unknown) => Promise<unknown>}) => deps.sign([[txn]]);
 c.votingKey = c.selectionKey = c.stateProofKey = '';
 c.firstRound = 1; c.lastRound = 2; c.keyDilution = 1;
 c.payIncentiveFee = false;
 c.incentiveKeyregFee = () => 1000n;
 c.abi = {custom: {}};
 c.CONTRACT = vi.fn(function (...args: unknown[]) {
  expect(args[4]).toEqual(expect.objectContaining({addr: 'Y'}));
  return {participate: async () => ({obj: {}}), withdraw: async () => ({obj: {}}), custom: async () => ({txns: ['one', 'two']}), setFee: vi.fn(), setEnableGroupResourceSharing: vi.fn(), setExtraTxns: vi.fn()};
 });
 c.arc200Approve = async (_id: unknown, _spender: unknown, _amount: unknown, sender: string, callback: (txns: unknown[]) => Promise<unknown>) => {expect(sender).toBe('Y'); return callback([txn]);};
 c.arc200RevokeApproval = async (_id: unknown, _spender: unknown, sender: string, callback: (txns: unknown[]) => Promise<unknown>) => {expect(sender).toBe('Y'); return callback([txn]);};
 c.arc200TransferFrom = async (_id: unknown, _from: unknown, to: string, _amount: unknown, sender: string, callback: (txns: unknown[]) => Promise<unknown>) => {expect(to).toBe('Y'); expect(sender).toBe('Y'); return callback([txn]);};
 c.claimableTokensSummary = [{token: c.token, approvals: c.approvals}];
 c.algodIndexer = {};
 c.loadClaimBuilder = async () => ({arc200: class {
  constructor(_id: unknown, _algod: unknown, _indexer: unknown, opts: {acc: {addr: string}}) {expect(opts.acc.addr).toBe('Y');}
  async arc200_transferFrom(_from: unknown, to: string) {expect(to).toBe('Y'); return {success: true, txns: ['one']};}
 }});
 await h.run();
 expect(h.capturePageSigner).toHaveBeenCalledExactlyOnceWith('Y');
 expect(sign).toHaveBeenCalledOnce();
 const [groups, signer] = sign.mock.calls[0] as unknown as [unknown, unknown];
 expect(Array.isArray(groups)).toBe(true);
 expect(signer).toEqual({address: 'Y', walletId: 'pera'});
});
