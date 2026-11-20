import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import * as algosdk from 'algosdk';
import { render } from 'svelte/server';
import {
	buildWalletKeyregTxn,
	contractKeyregCost,
	INCENTIVE_KEYREG_FEE,
	incentiveKeyregFee,
	keyregSendFailure,
	MIN_KEYREG_FEE,
	onChainKeyregOffer,
	participatePayment,
	sendWalletKeyreg
} from '$lib/chain/keyreg';
import { signerMatchesAccount, wrongSignerMessage } from '$lib/chain/signerGate';
import { FALLBACK_BLOCK_TIME } from '$lib/chain/blockTime';
import { describe, expect, test, vi } from 'vitest';
import Panel from './OnChainEligibilityPanel.svelte';

// One click for an account that is online without the incentive fee: re-register the keys already
// on chain with the 2 VOI fee. There is no DOM runner (TASK-124), so the handlers run from the
// component source and the panel renders on the server.
const source = readFileSync(new URL('./RegisterVoteKey.svelte', import.meta.url), 'utf8');

const WALLET = algosdk.generateAccount().addr.toString();
const OWNER = algosdk.generateAccount().addr.toString();
const CONTRACT_ID = 4321;
const CONTRACT_ACCOUNT = algosdk.getApplicationAddress(CONTRACT_ID).toString();
const ROUND = 5_000_000;
const vote = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
const selection = Uint8Array.from({ length: 32 }, (_, i) => 160 + i);
const stateProof = Uint8Array.from({ length: 64 }, (_, i) => 192 + i);

function record(
	changes: Record<string, unknown> = {},
	participation: Record<string, unknown> = {}
) {
	return {
		status: 'Online',
		incentiveEligible: false,
		round: BigInt(ROUND),
		participation: {
			voteParticipationKey: vote,
			selectionParticipationKey: selection,
			stateProofKey: stateProof,
			voteFirstValid: 4_000_000n,
			voteLastValid: 9_000_000n,
			voteKeyDilution: 2237n,
			...participation
		},
		...changes
	};
}

const params = {
	fee: 0n,
	minFee: 1000n,
	flatFee: false,
	firstValid: 5_000_000n,
	lastValid: 5_001_000n,
	genesisID: 'voimain-v1.0',
	genesisHash: new Uint8Array(32).fill(1)
};

function harness(opts: {
	contract?: boolean;
	contractIncentive?: string;
	reads?: unknown[];
	recheck?: string;
}) {
	const functions = [
		'signerOrError',
		'registerWalletVoteKey',
		'registerStakingContractVoteKey',
		'registerOnChainKeys'
	]
		.map((fn) => {
			const body = source.match(new RegExp(`(?:async )?function ${fn}\\([^]*?\\n\\t\\}`))?.[0];
			if (!body) throw new Error(`Missing ${fn}`);
			return body;
		})
		.join('\n');
	const contract = opts.contract ?? false;
	const reads = [...(opts.reads ?? [record()])];
	const accountInformation = vi.fn(() => ({
		exclude: () => ({
			do: async () => {
				const next = reads.length > 1 ? reads.shift() : reads[0];
				if (next instanceof Error) throw next;
				return next;
			}
		})
	}));
	const getTransactionParams = vi.fn(() => ({ do: async () => params }));
	const signAndSendTransactions = vi.fn().mockResolvedValue(true);
	const setExtraTxns = vi.fn();
	const participate = vi.fn().mockResolvedValue({ obj: {} });
	const custom = vi.fn().mockResolvedValue({ txns: ['txn1', 'txn2'] });
	const CONTRACT = vi.fn(function () {
		return {
			participate,
			custom,
			setFee: vi.fn(),
			setEnableGroupResourceSharing: vi.fn(),
			setExtraTxns
		};
	});
	const contractIncentiveOf = vi.fn().mockResolvedValue(opts.recheck ?? 'capable');
	const contractIncentive = opts.contractIncentive ?? (contract ? 'capable' : 'checking');
	const signer = contract ? OWNER : WALLET;
	const context = createContext({
		console: { log: vi.fn(), error: vi.fn() },
		Error,
		Buffer,
		Number,
		String,
		canSignTransactions: true,
		capturePageSigner: () => ({ address: signer }),
		signerMatchesAccount,
		wrongSignerMessage,
		pageAddress: signer,
		walletAddress: contract ? CONTRACT_ACCOUNT : WALLET,
		parentWalletAddress: contract ? OWNER : null,
		contractId: contract ? CONTRACT_ID : null,
		currentAccount: contract ? CONTRACT_ACCOUNT : WALLET,
		isStakingContract: contract,
		contractIncentive,
		contractCanPay: contract && contractIncentive === 'capable',
		error: null,
		isLoading: false,
		transactionStatus: 'idle',
		transactionId: null,
		CONTRACT,
		abi: { custom: {} },
		algodClient: { accountInformation, getTransactionParams },
		algosdk: {
			waitForConfirmation: vi.fn().mockResolvedValue({}),
			decodeUnsignedTransaction: () => ({ txID: () => 'tx' })
		},
		votingKey: '',
		selectionKey: '',
		stateProofKey: '',
		firstRound: '',
		lastRound: '',
		keyDilution: '',
		payIncentiveFee: false,
		keyregPasteAccount: 'SOMEONE',
		pastedUriFee: 1000,
		incentiveNotice: 'old notice',
		signAndSendTransactions,
		onSuccess: vi.fn(),
		onChainKeyregOffer,
		buildWalletKeyregTxn,
		sendWalletKeyreg,
		incentiveKeyregFee,
		keyregSendFailure,
		participatePayment,
		contractIncentiveOf,
		MIN_KEYREG_FEE
	});
	runInContext(ts.transpileModule(functions, {}).outputText, context);
	return {
		context,
		accountInformation,
		getTransactionParams,
		signAndSendTransactions,
		participate,
		setExtraTxns,
		contractIncentiveOf,
		sends: [CONTRACT, participate, custom, setExtraTxns, signAndSendTransactions],
		run: () => runInContext('registerOnChainKeys()', context) as Promise<void>
	};
}

const bytes = (key: Uint8Array | undefined) => Array.from(key ?? []);

function sentWalletTxn(h: ReturnType<typeof harness>): algosdk.Transaction {
	expect(h.signAndSendTransactions).toHaveBeenCalledOnce();
	const [groups] = h.signAndSendTransactions.mock.calls[0];
	expect(groups).toHaveLength(1);
	expect(groups[0]).toHaveLength(1);
	return groups[0][0];
}

describe('re-registering the on-chain keys', () => {
	test('an account sends one keyreg with the on-chain keys and the flat 2 VOI fee', async () => {
		const h = harness({});
		await h.run();
		expect(h.context.error).toBeNull();
		const tx = sentWalletTxn(h);
		expect(tx.type).toBe('keyreg');
		expect(tx.sender.toString()).toBe(WALLET);
		expect(tx.fee).toBe(2_000_000n);
		expect(bytes(tx.keyreg?.voteKey)).toEqual(Array.from(vote));
		expect(bytes(tx.keyreg?.selectionKey)).toEqual(Array.from(selection));
		expect(bytes(tx.keyreg?.stateProofKey)).toEqual(Array.from(stateProof));
		expect(tx.keyreg?.voteFirst).toBe(4_000_000n);
		expect(tx.keyreg?.voteLast).toBe(9_000_000n);
		expect(tx.keyreg?.voteKeyDilution).toBe(2237n);
		expect(h.accountInformation).toHaveBeenCalledExactlyOnceWith(WALLET);
		expect(h.context.transactionStatus).toBe('success');
	});

	test('the click fills the form from chain and resets the paste state', async () => {
		const h = harness({});
		await h.run();
		expect({
			votingKey: h.context.votingKey,
			selectionKey: h.context.selectionKey,
			stateProofKey: h.context.stateProofKey,
			firstRound: h.context.firstRound,
			lastRound: h.context.lastRound,
			keyDilution: h.context.keyDilution,
			payIncentiveFee: h.context.payIncentiveFee,
			keyregPasteAccount: h.context.keyregPasteAccount,
			pastedUriFee: h.context.pastedUriFee,
			incentiveNotice: h.context.incentiveNotice
		}).toEqual({
			votingKey: Buffer.from(vote).toString('base64'),
			selectionKey: Buffer.from(selection).toString('base64'),
			stateProofKey: Buffer.from(stateProof).toString('base64'),
			firstRound: '4000000',
			lastRound: '9000000',
			keyDilution: '2237',
			payIncentiveFee: true,
			keyregPasteAccount: null,
			pastedUriFee: null,
			incentiveNotice: null
		});
	});

	test('an edit to the form while the registration builds does not change what is sent', async () => {
		const h = harness({});
		h.getTransactionParams.mockImplementationOnce(() => ({
			do: async () => {
				Object.assign(h.context, {
					votingKey: Buffer.alloc(32, 9).toString('base64'),
					lastRound: '1',
					payIncentiveFee: false
				});
				return params;
			}
		}));
		await h.run();
		const tx = sentWalletTxn(h);
		expect(bytes(tx.keyreg?.voteKey)).toEqual(Array.from(vote));
		expect(tx.keyreg?.voteLast).toBe(9_000_000n);
		expect(tx.fee).toBe(2_000_000n);
	});

	test('a capable contract sends the participate group with the 2 VOI payment and on-chain keys', async () => {
		const h = harness({ contract: true });
		await h.run();
		expect(h.context.error).toBeNull();
		expect(h.accountInformation).toHaveBeenCalledExactlyOnceWith(CONTRACT_ACCOUNT);
		expect(h.contractIncentiveOf).toHaveBeenCalledOnce();
		const args = h.participate.mock.calls[0];
		expect(
			args.map((arg: unknown) => (typeof arg === 'number' ? arg : Array.from(arg as Uint8Array)))
		).toEqual([
			Array.from(vote),
			Array.from(selection),
			4_000_000,
			9_000_000,
			2237,
			Array.from(stateProof)
		]);
		expect(h.setExtraTxns.mock.calls[0][0][0].payment).toBe(2_000_000);
		expect(h.signAndSendTransactions).toHaveBeenCalledOnce();
		expect(h.signAndSendTransactions.mock.calls[0][1]).toEqual({ address: OWNER });
		expect(h.context.transactionStatus).toBe('success');
	});

	test('a contract whose fresh program check fails sends nothing and returns to idle', async () => {
		const h = harness({ contract: true, recheck: 'incapable' });
		await h.run();
		for (const call of h.sends) expect(call).not.toHaveBeenCalled();
		expect(h.context.error).toMatch(/nothing was sent/);
		expect(h.context.transactionStatus).toBe('idle');
	});

	test.each(['checking', 'incapable', 'unverified'])(
		'a contract that is %s sends nothing',
		async (contractIncentive) => {
			const h = harness({ contract: true, contractIncentive });
			await h.run();
			for (const call of h.sends) expect(call).not.toHaveBeenCalled();
			expect(h.context.error).toMatch(/nothing was sent/);
			expect(h.context.transactionStatus).toBe('idle');
		}
	);

	test.each([
		['now eligible', record({ incentiveEligible: true })],
		['now offline', record({ status: 'Offline' })],
		['expired', record({ round: 9_000_001n })],
		['without a state proof key', record({}, { stateProofKey: undefined })],
		['unreadable', new Error('algod down')]
	])('a fresh read that finds the account %s sends nothing', async (_, fresh) => {
		const h = harness({ reads: [fresh] });
		h.context.votingKey = 'UNCHANGED';
		await h.run();
		expect(h.signAndSendTransactions).not.toHaveBeenCalled();
		expect(h.getTransactionParams).not.toHaveBeenCalled();
		expect(h.context.error).toMatch(/nothing was sent/);
		expect(h.context.transactionStatus).toBe('idle');
		expect(h.context.votingKey).toBe('UNCHANGED');
		expect(h.context.payIncentiveFee).toBe(false);
	});

	test('the keys come from the fresh read at the click, not an earlier one', async () => {
		const rotated = Uint8Array.from({ length: 32 }, (_, i) => i);
		const h = harness({ reads: [record({}, { voteParticipationKey: rotated })] });
		await h.run();
		expect(bytes(sentWalletTxn(h).keyreg?.voteKey)).toEqual(Array.from(rotated));
	});

	test('a second click while the first is running starts nothing', async () => {
		const h = harness({});
		const first = h.run();
		expect(h.context.transactionStatus).toBe('building');
		const second = h.run();
		await Promise.all([first, second]);
		expect(h.accountInformation).toHaveBeenCalledOnce();
		expect(h.signAndSendTransactions).toHaveBeenCalledOnce();
	});

	test('a click during a paste or another transaction does nothing', async () => {
		for (const state of [{ isLoading: true }, { transactionStatus: 'success' }]) {
			const h = harness({});
			Object.assign(h.context, state);
			await h.run();
			expect(h.accountInformation).not.toHaveBeenCalled();
		}
	});

	test('a page that is not the signing account sends nothing and stays idle', async () => {
		const h = harness({});
		h.context.canSignTransactions = false;
		await h.run();
		expect(h.accountInformation).not.toHaveBeenCalled();
		expect(h.context.error).toBe(wrongSignerMessage());
		expect(h.context.transactionStatus).toBe('idle');
	});

	test('a registration that stops at the signer check returns to idle', async () => {
		const h = harness({ contract: true });
		h.context.capturePageSigner = () => ({ address: 'SOMEONE ELSE' });
		await h.run();
		for (const call of h.sends) expect(call).not.toHaveBeenCalled();
		expect(h.context.error).toBe(wrongSignerMessage());
		expect(h.context.transactionStatus).toBe('idle');
	});
});

describe('the eligibility panel', () => {
	const offer = (roundsLeft: number) => {
		const result = onChainKeyregOffer(
			WALLET,
			record({}, { voteLastValid: BigInt(ROUND + roundsLeft) }),
			{ isStakingContract: false, contractIncentive: 'checking' }
		);
		if (result.kind !== 'offer') throw new Error('expected an offer');
		return result;
	};
	const now = Date.UTC(2026, 10, 20);
	const html = (props: Record<string, unknown>) =>
		render(Panel, {
			props: {
				offer: offer(4_000_000),
				cost: 2,
				canRegister: true,
				disabled: false,
				now,
				onRegister: vi.fn(),
				...props
			}
		}).body.replace(/\s+/g, ' ');

	test('explains the re-registration and shows the key end and the button', () => {
		const body = html({});
		expect(body).toContain('Make your current registration eligible');
		expect(body).toContain(
			'Your keys are already registered on chain. Pay the 2 VOI incentive fee to re-register the same keys and become eligible for real-time block rewards. Your node stays online.'
		);
		const end = new Date(now + 4_000_000 * FALLBACK_BLOCK_TIME * 1000).toLocaleDateString(
			undefined,
			{ dateStyle: 'medium' }
		);
		expect(body).toContain(`Keys valid until round ${(ROUND + 4_000_000).toLocaleString()}`);
		expect(body).toContain(`(about ${end})`);
		expect(body).toContain(
			'This re-registers the keys on chain now. If your node has newer keys, register those instead.'
		);
		expect(body).toMatch(/<button[^>]*>[^]*Pay 2 VOI and re-register[^]*\(2 VOI\)[^]*<\/button>/);
		expect(body).not.toMatch(/<button[^>]*\sdisabled(?:=|[\s>])/);
		expect(body).not.toContain('poor deal');
	});

	test('shows the contract cost on the button', () => {
		expect(html({ cost: contractKeyregCost(INCENTIVE_KEYREG_FEE) / 1e6 })).toContain('(2.002 VOI)');
	});

	test('disables the button while a transaction or paste is in progress', () => {
		expect(html({ disabled: true })).toMatch(/<button[^>]*\sdisabled(?:=|[\s>])/);
	});

	test('shows the text without a button for an account that cannot sign here', () => {
		const body = html({ canRegister: false });
		expect(body).toContain('Make your current registration eligible');
		expect(body).not.toContain('<button');
	});

	test('warns about keys ending soon and keeps the button available', () => {
		const days = 10;
		const body = html({ offer: offer(Math.round((days * 86_400) / FALLBACK_BLOCK_TIME)) });
		expect(body).toContain(
			`These keys end in about ${days} days. Paying 2 VOI for keys that end soon is a poor deal: consider generating new keys and registering them with the 2 VOI option below.`
		);
		expect(body).toContain('text-amber-700');
		expect(body).not.toMatch(/<button[^>]*\sdisabled(?:=|[\s>])/);
	});
});

describe('the modal wiring', () => {
	test('the panel shows only for an offer from the mount read, and hides after success', () => {
		expect(source).toMatch(
			/\$: onChainOffer =\s*accountRecord === null\s*\? NO_OFFER\s*: onChainKeyregOffer\(currentAccount, accountRecord, \{ isStakingContract, contractIncentive \}\);/
		);
		expect(source).toMatch(
			/\{#if onChainOffer\.kind === 'offer' && transactionStatus !== 'success'\}\s*<OnChainEligibilityPanel/
		);
	});

	test('the button renders only where Register Key does and is disabled unless idle', () => {
		const panel = source.match(/<OnChainEligibilityPanel[^]*?\/>/)?.[0] ?? '';
		expect(panel).toContain(
			'canRegister={canSignTransactions && pageAddress === (parentWalletAddress ?? walletAddress)}'
		);
		expect(panel).toContain("disabled={transactionStatus !== 'idle' || isLoading}");
		expect(panel).toContain('onRegister={registerOnChainKeys}');
		expect(panel).toMatch(
			/cost=\{isStakingContract\s*\? contractKeyregCost\(INCENTIVE_KEYREG_FEE\) \/ 1e6\s*: walletKeyregFee\(INCENTIVE_KEYREG_FEE, minFee\) \/ 1e6\}/
		);
	});

	test('the mount read keeps the account record for the offer', () => {
		expect(source).toMatch(
			/accountRecord = await algodClient\.accountInformation\(currentAccount\)\.exclude\('all'\)\.do\(\);/
		);
		expect(source).toMatch(/\$: alreadyEligible = accountRecord\?\.incentiveEligible === true;/);
	});
});
