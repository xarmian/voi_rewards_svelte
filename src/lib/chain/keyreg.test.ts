import * as algosdk from 'algosdk';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
	buildWalletKeyregTxn,
	contractIncentiveOf,
	contractKeyregCost,
	incentiveFromUri,
	incentiveKeyregFee,
	INCENTIVE_CAPABLE_PROGRAM_HASHES,
	isIncentiveCapableProgram,
	isKeyregUri,
	keyregAccount,
	keyregFee,
	keyregSubmitError,
	EXPIRING_SOON_SECONDS,
	formatMicroVoi,
	mayHaveLanded,
	ONCHAIN_KEYREG_MIN_ROUNDS_LEFT,
	onChainKeyregOffer,
	parseKeyregInput,
	participateGroupTxns,
	participatePayment,
	programHash,
	KeyregUnconfirmedError,
	sendWalletKeyreg,
	shortfallMessage,
	signerShortfall
} from './keyreg';
import { FALLBACK_BLOCK_TIME } from '$lib/chain/blockTime';
import {
	BLOCK_REWARD_MAX_MICROVOI,
	BLOCK_REWARD_MIN_MICROVOI
} from '$lib/rewards/blockRewardConstants';

const address = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';
const voteBytes = Buffer.from(Array.from({ length: 32 }, (_, i) => 255 - i));
const selectionBytes = Buffer.from(Array.from({ length: 32 }, (_, i) => 160 + i));
const stateProofBytes = Buffer.from(Array.from({ length: 64 }, (_, i) => 192 + i));
const keys = {
	parentAddress: address,
	firstRound: 3047143,
	lastRound: 8047143,
	keyDilution: 2237,
	selectionKey: selectionBytes.toString('base64'),
	votingKey: voteBytes.toString('base64'),
	stateProofKey: stateProofBytes.toString('base64')
};
const params = {
	fee: 0,
	minFee: 1000,
	flatFee: false,
	firstValid: 4000000,
	lastValid: 4001000,
	genesisID: 'voimain-v1.0',
	genesisHash: new Uint8Array(32).fill(1)
};
const partkeyinfo = `Parent address: ${address}
First round: ${keys.firstRound}
Last round: ${keys.lastRound}
Key dilution: ${keys.keyDilution}
Selection key: ${keys.selectionKey}
Voting key: ${keys.votingKey}
State proof key: ${keys.stateProofKey}`;
const uriParams = {
	type: 'keyreg',
	votekey: voteBytes.toString('base64url'),
	selkey: selectionBytes.toString('base64url'),
	sprfkey: stateProofBytes.toString('base64url'),
	votefst: String(keys.firstRound),
	votelst: String(keys.lastRound),
	votekd: String(keys.keyDilution)
};

function uri(
	changes: Record<string, string | null> = {},
	prefix = `voi://net:voimain-v1.0/${address}`
) {
	const params = new URLSearchParams(uriParams);
	for (const [name, value] of Object.entries(changes)) {
		if (value === null) params.delete(name);
		else params.set(name, value);
	}
	return `${prefix}?${params}`;
}

function expectError(input: string, problem: string | RegExp) {
	const result = parseKeyregInput(input);
	expect(result.ok).toBe(false);
	if (!result.ok) expect(result.error).toMatch(problem);
}

describe('parseKeyregInput', () => {
	it('produces identical keys from partkeyinfo and an unpadded base64url URI', () => {
		const fromText = parseKeyregInput(` \n${partkeyinfo}\n `);
		const fromUri = parseKeyregInput(` \n${uri()}\n `);
		expect(fromText).toEqual({ ok: true, keys, fee: null });
		expect(fromUri).toEqual(fromText);
	});

	it('still parses the sample shown in the node instructions', () => {
		const sample = `Participation ID:          AOEZ2UIMKR3XNMTUSAKJJ2VKAU3FQPKJLSITW32DK5SNTQ2FG3QQ
Parent address:            NPXMG3RB33CCFIKVDMJZIKARYE7MPEPXCKZJERNAEMKHGSWS2GC6W5O2ZQ
Last vote round:           5026835
Last block proposal round: 5026621
Effective first round:     3047662
Effective last round:      8047143
First round:               3047143
Last round:                8047143
Key dilution:              2237
Selection key:             jsNw/NIrOVlnYESOQk1XDXTA/TugvMLG/4mvZTuz1Ik=
Voting key:                DBQAnaGIEGMigiaQh4zec4XMg+SkItt49ua2QUaeAeE=
State proof key:           wLM3N1RWc+WLU3PKng5ZS5gKhG9Xu+EAkdL2ztBzcj2Er43mWlwSptoIjNMlI5AYJeUeRtL7kfCS8y3u3eMeHw==`;
		expect(parseKeyregInput(sample)).toEqual({
			ok: true,
			keys: {
				parentAddress: 'NPXMG3RB33CCFIKVDMJZIKARYE7MPEPXCKZJERNAEMKHGSWS2GC6W5O2ZQ',
				firstRound: 3047143,
				lastRound: 8047143,
				keyDilution: 2237,
				selectionKey: 'jsNw/NIrOVlnYESOQk1XDXTA/TugvMLG/4mvZTuz1Ik=',
				votingKey: 'DBQAnaGIEGMigiaQh4zec4XMg+SkItt49ua2QUaeAeE=',
				stateProofKey:
					'wLM3N1RWc+WLU3PKng5ZS5gKhG9Xu+EAkdL2ztBzcj2Er43mWlwSptoIjNMlI5AYJeUeRtL7kfCS8y3u3eMeHw=='
			},
			fee: null
		});
	});

	it('keeps the legacy required-field error', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			expect(parseKeyregInput(partkeyinfo.replace(`Voting key: ${keys.votingKey}`, ''))).toEqual({
				ok: false,
				error: 'Invalid clipboard content format'
			});
		} finally {
			log.mockRestore();
		}
	});

	it('preserves legacy line matching, integer parsing and optional parent address', () => {
		const input = partkeyinfo
			.replace(`Parent address: ${address}\n`, '')
			.replace('First round: 3047143', '  First round: 3047143 rounds');
		expect(parseKeyregInput(input)).toEqual({
			ok: true,
			keys: { ...keys, parentAddress: '' },
			fee: null
		});
	});

	it.each([1000, 2000000])('preserves a URI fee of %i microVOI', (fee) => {
		expect(parseKeyregInput(uri({ fee: String(fee) }))).toEqual({ ok: true, keys, fee });
	});

	it.each([
		['voi://net:voitest-v1.1/', 'voitest-v1.1'],
		['voi://net:voibeta-v1.0/', 'voibeta-v1.0'],
		['algorand://net:testnet/', 'testnet'],
		['algorand://net:voimain-v1.0/', 'voimain-v1.0'],
		['algorand://', 'Algorand MainNet']
	])('rejects a different scheme or network: %s', (prefix, network) => {
		const input = uri({}, `${prefix}${address}`);
		expectError(input, network);
		expectError(input, /Voi MainNet only/);
	});

	it.each([null, '', 'pay'])('rejects missing or incorrect type: %s', (type) => {
		expectError(uri({ type }), /type.*keyreg/);
	});

	it.each(['invalid-address', address.slice(0, -1) + (address.endsWith('A') ? 'B' : 'A'), ''])(
		'rejects invalid address: %s',
		(sender) => {
			expectError(uri({}, `voi://net:voimain-v1.0/${sender}`), /address/i);
		}
	);

	it('directs a go-offline URI to the Go Offline button', () => {
		expectError(`voi://net:voimain-v1.0/${address}?type=keyreg`, /Go Offline button/);
	});

	it.each(['votekey', 'selkey', 'votefst', 'votelst', 'votekd'])(
		'rejects a missing required parameter: %s',
		(name) => expectError(uri({ [name]: null }), name)
	);

	it('explains a missing state proof key', () => {
		expectError(uri({ sprfkey: null }), /no state proof key/i);
	});

	it.each([
		['votekey', 32],
		['selkey', 32],
		['sprfkey', 64]
	])('rejects incorrect length or encoding for %s', (name, length) => {
		for (const value of [Buffer.alloc(length - 1).toString('base64url'), '%%%']) {
			expectError(uri({ [name]: value }), name);
			expectError(uri({ [name]: value }), new RegExp(`${length} bytes`));
		}
	});

	it.each(['votefst', 'votelst', 'votekd'])('rejects non-integer %s', (name) => {
		for (const value of ['1.5', '1e6', '-1', 'NaN', '', '9007199254740992']) {
			expectError(uri({ [name]: value }), name);
		}
	});

	it('rejects an inverted validity range', () => {
		expectError(uri({ votelst: '1' }), /votelst.*votefst/);
	});

	it('rejects zero key dilution', () => {
		expectError(uri({ votekd: '0' }), /votekd/);
	});

	it.each(['', '0', '-1', '1.5', '1e6', 'NaN', '999', '2000001', '9007199254740992'])(
		'rejects invalid or unsafe fee: %s',
		(fee) => expectError(uri({ fee }), /fee.*1000.*2000000/)
	);
});

describe('buildWalletKeyregTxn', () => {
	const online = { params, sender: address, ...keys };

	it('uses the flat minimum fee online and preserves key material', () => {
		const txn = buildWalletKeyregTxn(online);
		expect(txn.fee).toBe(1000n);
		expect(new Uint8Array(txn.keyreg?.voteKey ?? [])).toEqual(new Uint8Array(voteBytes));
		expect(new Uint8Array(txn.keyreg?.selectionKey ?? [])).toEqual(new Uint8Array(selectionBytes));
		expect(new Uint8Array(txn.keyreg?.stateProofKey ?? [])).toEqual(
			new Uint8Array(stateProofBytes)
		);
		expect(params).toMatchObject({ fee: 0, flatFee: false });
	});

	it('uses the flat incentive fee online', () => {
		const parsed = parseKeyregInput(uri({ fee: '2000000' }));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) throw new Error(parsed.error);
		const txn = buildWalletKeyregTxn({ params, sender: address, ...parsed.keys, fee: parsed.fee });
		expect(txn.fee).toBe(2000000n);
	});

	it('uses the flat minimum fee offline', () => {
		const txn = buildWalletKeyregTxn({ params, sender: address, offline: true });
		expect(txn.fee).toBe(1000n);
	});

	// TASK-78: nonpart on the wire would make the account permanently non-participating.
	it('builds offline as a keyreg with no keys and no nonParticipation flag', () => {
		const txn = buildWalletKeyregTxn({ params, sender: address, offline: true });
		expect(txn.keyreg?.nonParticipation).toBe(false);
		const wire = algosdk.msgpackRawDecode(algosdk.encodeUnsignedTransaction(txn)) as Record<
			string,
			unknown
		>;
		expect(wire.type).toBe('keyreg');
		for (const field of [
			'nonpart',
			'votekey',
			'selkey',
			'sprfkey',
			'votefst',
			'votelst',
			'votekd'
		]) {
			expect(wire).not.toHaveProperty(field);
		}
		const decoded = algosdk.decodeUnsignedTransaction(algosdk.encodeUnsignedTransaction(txn));
		expect(decoded.keyreg?.nonParticipation).toBeFalsy();
		expect(decoded.keyreg?.voteKey).toBeUndefined();
	});

	it('raises a URI fee below the suggested minimum to that minimum', () => {
		const raised = { ...online, params: { ...params, minFee: 1500 }, fee: 1000 };
		expect(buildWalletKeyregTxn(raised).fee).toBe(1500n);
	});

	it('uses a suggested minimum when supplied and falls back to 1000 when absent', () => {
		expect(buildWalletKeyregTxn({ ...online, params: { ...params, minFee: 1500 } }).fee).toBe(
			1500n
		);
		expect(buildWalletKeyregTxn({ ...online, params: { ...params, minFee: undefined } }).fee).toBe(
			1000n
		);
	});

	it('reproduces the old per-byte fee bug as a control', () => {
		const txn = algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
			sender: address,
			voteKey: voteBytes,
			selectionKey: selectionBytes,
			stateProofKey: stateProofBytes,
			voteFirst: keys.firstRound,
			voteLast: keys.lastRound,
			voteKeyDilution: keys.keyDilution,
			suggestedParams: { ...params, fee: 1000, flatFee: false }
		});
		expect(txn.fee).toBeGreaterThan(1000n);
	});
});

describe('sendWalletKeyreg', () => {
	it.each([{ result: true }, { result: ['provider-result'] }])(
		'confirms the local transaction ID for a truthy wallet result: $result',
		async ({ result }) => {
			const tx = buildWalletKeyregTxn({ params, sender: address, ...keys });
			const txid = tx.txID();
			const signAndSend = vi.fn().mockResolvedValue(result);
			const waitForConfirmation = vi.fn().mockResolvedValue({});

			await expect(sendWalletKeyreg(tx, { signAndSend, waitForConfirmation })).resolves.toBe(txid);
			expect(signAndSend).toHaveBeenCalledExactlyOnceWith([[tx]]);
			expect(waitForConfirmation).toHaveBeenCalledExactlyOnceWith(txid);
		}
	);

	it.each([undefined, false])('rejects a falsy wallet result: %s', async (result) => {
		const tx = buildWalletKeyregTxn({ params, sender: address, ...keys });
		const signAndSend = vi.fn().mockResolvedValue(result);
		const waitForConfirmation = vi.fn();

		await expect(sendWalletKeyreg(tx, { signAndSend, waitForConfirmation })).rejects.toThrow(
			'Failed to send wallet key registration transaction'
		);
		expect(waitForConfirmation).not.toHaveBeenCalled();
	});

	it('propagates the wallet error unchanged without waiting for confirmation', async () => {
		const tx = buildWalletKeyregTxn({ params, sender: address, ...keys });
		const error = new Error('Wallet rejected the transaction');
		const signAndSend = vi.fn().mockRejectedValue(error);
		const waitForConfirmation = vi.fn();

		await expect(sendWalletKeyreg(tx, { signAndSend, waitForConfirmation })).rejects.toBe(error);
		expect(waitForConfirmation).not.toHaveBeenCalled();
	});

	it('reports submission before the confirmation wait, and never for a falsy result', async () => {
		const tx = buildWalletKeyregTxn({ params, sender: address, ...keys });
		const calls: string[] = [];
		const onSubmitted = vi.fn((id: string) => calls.push(`submitted ${id}`));
		const waitForConfirmation = vi.fn(async (id: string) => calls.push(`wait ${id}`));

		await sendWalletKeyreg(tx, {
			signAndSend: vi.fn().mockResolvedValue(true),
			waitForConfirmation,
			onSubmitted
		});
		expect(calls).toEqual([`submitted ${tx.txID()}`, `wait ${tx.txID()}`]);

		onSubmitted.mockClear();
		await expect(
			sendWalletKeyreg(tx, {
				signAndSend: vi.fn().mockResolvedValue(undefined),
				waitForConfirmation,
				onSubmitted
			})
		).rejects.toThrow('Failed to send');
		expect(onSubmitted).not.toHaveBeenCalled();
	});

	it('reports a failed wait after a send as unconfirmed, with the txid, not as a failed send', async () => {
		const tx = buildWalletKeyregTxn({ params, sender: address, ...keys });
		const rejection = sendWalletKeyreg(tx, {
			signAndSend: vi.fn().mockResolvedValue(true),
			waitForConfirmation: vi
				.fn()
				.mockRejectedValue(new Error('Transaction not confirmed after 4 rounds'))
		});

		await expect(rejection).rejects.toBeInstanceOf(KeyregUnconfirmedError);
		await expect(rejection).rejects.toMatchObject({ txid: tx.txID() });
		await expect(rejection).rejects.toThrow(`Transaction ${tx.txID()} was sent but not confirmed`);
	});
});

describe('account check (r2)', () => {
	const other = algosdk.generateAccount().addr.toString();
	const appId = 40123456;
	const appAddress = algosdk.getApplicationAddress(appId).toString();

	it('accepts a URI for the plain account being registered', () => {
		expect(parseKeyregInput(uri(), { account: address })).toEqual({ ok: true, keys, fee: null });
	});

	it('rejects a URI for a different plain account, naming both', () => {
		const result = parseKeyregInput(uri({}, `voi://net:voimain-v1.0/${other}`), {
			account: address
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/different account/);
			expect(result.error).toContain(`${other.slice(0, 4)}…${other.slice(-4)}`);
			expect(result.error).toContain(`${address.slice(0, 4)}…${address.slice(-4)}`);
		}
	});

	it('resolves a staking contract to its application account, a plain wallet to itself', () => {
		expect(
			keyregAccount({ walletAddress: appAddress, parentWalletAddress: other, contractId: appId })
		).toBe(appAddress);
		expect(
			keyregAccount({ walletAddress: address, parentWalletAddress: null, contractId: null })
		).toBe(address);
	});

	it('accepts a contract URI for the application account and rejects the owner address', () => {
		const account = keyregAccount({
			walletAddress: appAddress,
			parentWalletAddress: other,
			contractId: appId
		});
		const forApp = parseKeyregInput(uri({}, `voi://net:voimain-v1.0/${appAddress}`), { account });
		expect(forApp.ok).toBe(true);
		const forOwner = parseKeyregInput(uri({}, `voi://net:voimain-v1.0/${other}`), { account });
		expect(forOwner).toMatchObject({
			ok: false,
			error: expect.stringMatching(/different account/)
		});
	});

	it('keeps the partkeyinfo path free of the hard account check', () => {
		expect(parseKeyregInput(partkeyinfo, { account: other })).toEqual({
			ok: true,
			keys,
			fee: null
		});
	});
});

describe('URI params (r2)', () => {
	it.each([
		['&fee=1000&fee=2000000', /repeats the fee/],
		[`&votekey=${uriParams.votekey}`, /repeats the votekey/],
		['&foo=bar', /unknown parameter: foo/],
		['&note=hi', /note/],
		['&xnote=hi', /note/]
	])('rejects %s', (extra, problem) => {
		expectError(uri() + extra, problem);
	});
});

describe('keyregFee (r2)', () => {
	it('is the URI fee raised to the network minimum', () => {
		expect(keyregFee(null, 1000)).toBe(1000);
		expect(keyregFee(1000, 1500)).toBe(1500);
		expect(keyregFee(2000000, 1000)).toBe(2000000);
		expect(keyregFee(null, undefined)).toBe(1000);
	});
});

describe('submit-time account re-check (r3)', () => {
	const owner = algosdk.generateAccount().addr.toString();
	const accountFor = (contractId: number | null, walletAddress = address) =>
		keyregAccount({
			walletAddress,
			parentWalletAddress: contractId === null ? null : owner,
			contractId
		});

	it('passes when the paste was checked against the account still being registered', () => {
		const checked = accountFor(40123456);
		const parsed = parseKeyregInput(uri({}, `voi://net:voimain-v1.0/${checked}`), {
			account: checked
		});
		expect(parsed.ok).toBe(true);
		expect(keyregSubmitError(checked, accountFor(40123456))).toBeNull();
	});

	it('refuses after a contract switch, naming both accounts', () => {
		const checked = accountFor(40123456);
		const now = accountFor(40123457);
		const error = keyregSubmitError(checked, now);
		expect(error).toMatch(/Paste the keys for this account again/);
		expect(error).toContain(`${checked.slice(0, 4)}…${checked.slice(-4)}`);
		expect(error).toContain(`${now.slice(0, 4)}…${now.slice(-4)}`);
	});

	it('refuses after a plain wallet switch', () => {
		const other = algosdk.generateAccount().addr.toString();
		expect(keyregSubmitError(accountFor(null), accountFor(null, other))).not.toBeNull();
	});

	it('does not apply to a partkeyinfo paste', () => {
		expect(keyregSubmitError(null, accountFor(null))).toBeNull();
	});

	it('tells a URI from partkeyinfo the way the parser does', () => {
		expect(isKeyregUri(` ${uri()}`)).toBe(true);
		expect(isKeyregUri(partkeyinfo)).toBe(false);
	});
});

describe('incentive opt-in (TASK-68)', () => {
	it('pre-selects only for a plain account whose URI asks for the go-online fee', () => {
		expect(incentiveFromUri(2000000, false)).toBe(true);
		expect(incentiveFromUri(1000, false)).toBe(false);
		expect(incentiveFromUri(1999999, false)).toBe(false);
		expect(incentiveFromUri(null, false)).toBe(false);
	});

	it('pre-selects for an account that can pay and never for one that cannot', () => {
		expect(incentiveFromUri(2000000, false)).toBe(true);
		expect(incentiveFromUri(2000000, true)).toBe(false);
	});

	it('maps the opt-in to the flat keyreg fee it builds', () => {
		const params = {
			fee: 0,
			minFee: 1000,
			flatFee: false,
			firstValid: 4000000,
			lastValid: 4001000,
			genesisID: 'voimain-v1.0',
			genesisHash: new Uint8Array(32).fill(1)
		};
		const build = (on: boolean) =>
			buildWalletKeyregTxn({ params, sender: address, ...keys, fee: incentiveKeyregFee(on) });
		expect(build(true).fee).toBe(2000000n);
		expect(build(false).fee).toBe(1000n);
	});
});

// A staking contract can pay the go-online fee only when its approval program is one known to use
// the participate payment as the inner keyreg fee; an older one would keep the 2 VOI and register
// at the minimum fee, so the gate fails closed.
describe('staking contract incentive fee', () => {
	// App 37575's upgraded approval program, as algod returns it (base64 of the raw bytes).
	const capableProgram = new Uint8Array(
		Buffer.from(
			readFileSync(
				new URL('./fixtures/staking-37575-approval.b64', import.meta.url),
				'utf8'
			).trim(),
			'base64'
		)
	);

	it('hashes a program as lowercase hex sha256', async () => {
		expect(await programHash(new Uint8Array())).toBe(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
		);
		const program = new Uint8Array([0x0a, 0x20, 0x01, 0x01, 0x31, 0x18, 0xff]);
		expect(await programHash(program)).toBe(createHash('sha256').update(program).digest('hex'));
	});

	it('lists the hash of the real upgraded program', async () => {
		expect(capableProgram.length).toBeGreaterThan(0);
		expect(INCENTIVE_CAPABLE_PROGRAM_HASHES.has(await programHash(capableProgram))).toBe(true);
	});

	it('knows only the upgraded program as incentive capable', async () => {
		expect(isIncentiveCapableProgram(await programHash(capableProgram))).toBe(true);
		expect(
			isIncentiveCapableProgram('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
		).toBe(false);
		expect(isIncentiveCapableProgram(null)).toBe(false);
	});

	it('reads a capable program as capable and any other program as incapable', async () => {
		expect(await contractIncentiveOf(async () => capableProgram)).toBe('capable');
		const other = capableProgram.slice();
		other[other.length - 1] ^= 1;
		expect(await contractIncentiveOf(async () => other)).toBe('incapable');
		expect(await contractIncentiveOf(async () => new Uint8Array([0x0a, 0x81, 0x01]))).toBe(
			'incapable'
		);
	});

	it('fails closed to unverified when the program cannot be read', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			expect(await contractIncentiveOf(() => Promise.reject(new Error('algod down')))).toBe(
				'unverified'
			);
			expect(
				await contractIncentiveOf(() => {
					throw new Error('sync throw');
				})
			).toBe('unverified');
			expect(await contractIncentiveOf(async () => undefined)).toBe('unverified');
			expect(await contractIncentiveOf(async () => null)).toBe('unverified');
			expect(await contractIncentiveOf(async () => new Uint8Array())).toBe('unverified');
		} finally {
			consoleError.mockRestore();
		}
	});

	it('pays the go-online fee only when the user opts in and the contract can pay', () => {
		expect(participatePayment(true, true)).toBe(2_000_000);
		expect(participatePayment(true, false)).toBe(1000);
		expect(participatePayment(false, true)).toBe(1000);
		expect(participatePayment(false, false)).toBe(1000);
	});

	it('costs the payment plus the payment and app call fees', () => {
		expect(contractKeyregCost(1000)).toBe(3000);
		expect(contractKeyregCost(2_000_000)).toBe(2_002_000);
	});
});

// The v2 wallet library submits and confirms inside signAndSend, so it reports a failed wait as a
// submission error with one state per group (TASK-138). A group that may have landed must not read as
// a plain failure, or the user retries and registers the keys twice.
describe('sendWalletKeyreg with the library submission error', () => {
	const submissionError = (state: string) =>
		Object.assign(new Error('Submission failed at group 0: timeout'), {
			code: 'SIGNER_SUBMISSION_FAILED',
			groups: [{ index: 0, txIds: ['T'], state }]
		});

	it('reports a submitted-unconfirmed group as unconfirmed, naming the local transaction id', async () => {
		const tx = buildWalletKeyregTxn({ params, sender: address, ...keys });
		const signAndSend = vi.fn().mockRejectedValue(submissionError('submitted-unconfirmed'));
		const waitForConfirmation = vi.fn();
		const outcome = await sendWalletKeyreg(tx, { signAndSend, waitForConfirmation }).catch(
			(error) => error
		);
		expect(outcome).toBeInstanceOf(KeyregUnconfirmedError);
		expect(outcome.txid).toBe(tx.txID());
		expect(waitForConfirmation).not.toHaveBeenCalled();
	});

	it('keeps a not-sent group as the original failure, so a retry stays possible', async () => {
		const tx = buildWalletKeyregTxn({ params, sender: address, ...keys });
		const error = submissionError('not-sent');
		const signAndSend = vi.fn().mockRejectedValue(error);
		await expect(sendWalletKeyreg(tx, { signAndSend, waitForConfirmation: vi.fn() })).rejects.toBe(
			error
		);
	});

	it('does not mistake other errors for an unconfirmed send', () => {
		for (const error of [
			new Error('plain'),
			Object.assign(new Error('x'), { code: 'SIGNER_DISCONNECTED' }),
			Object.assign(new Error('x'), { code: 'SIGNER_SUBMISSION_FAILED' }),
			Object.assign(new Error('x'), { code: 'SIGNER_SUBMISSION_FAILED', groups: [null] }),
			null,
			'text'
		])
			expect(mayHaveLanded(error)).toBe(false);
	});

	it('treats any submitted-unconfirmed group in a multi-group failure as possibly landed', () => {
		const error = Object.assign(new Error('x'), {
			code: 'SIGNER_SUBMISSION_FAILED',
			groups: [
				{ index: 0, txIds: ['A'], state: 'confirmed' },
				{ index: 1, txIds: ['B'], state: 'submitted-unconfirmed' }
			]
		});
		expect(mayHaveLanded(error)).toBe(true);
	});
});

describe('onChainKeyregOffer', () => {
	const round = 5_000_000;
	const onChain = (
		changes: Record<string, unknown> = {},
		participation: Record<string, unknown> = {}
	) => ({
		status: 'Online',
		incentiveEligible: false,
		amount: 100_000_000_000n,
		round: BigInt(round),
		participation: {
			voteParticipationKey: new Uint8Array(voteBytes),
			selectionParticipationKey: new Uint8Array(selectionBytes),
			stateProofKey: new Uint8Array(stateProofBytes),
			voteFirstValid: BigInt(keys.firstRound),
			voteLastValid: BigInt(keys.lastRound),
			voteKeyDilution: BigInt(keys.keyDilution),
			...participation
		},
		...changes
	});
	const balanceRange = { min: BLOCK_REWARD_MIN_MICROVOI, max: BLOCK_REWARD_MAX_MICROVOI };
	const account = {
		isStakingContract: false,
		contractIncentive: 'checking' as const,
		balanceRange
	};
	const offer = (
		input: ReturnType<typeof onChain>,
		opts: Parameters<typeof onChainKeyregOffer>[2] = account
	) => onChainKeyregOffer(address, input, opts);

	it('offers the on-chain keys as the form holds them', () => {
		expect(offer(onChain())).toEqual({
			kind: 'offer',
			keys: { ...keys, parentAddress: address },
			roundsLeft: keys.lastRound - round,
			expiringSoon: false,
			balanceInRange: true
		});
		expect(keys.votingKey).toMatch(/=$/);
		expect(keys.stateProofKey).toMatch(/==$/);
	});

	it('accepts plain numbers as well as bigints', () => {
		const result = offer(
			onChain(
				{ round },
				{
					voteFirstValid: keys.firstRound,
					voteLastValid: keys.lastRound,
					voteKeyDilution: keys.keyDilution
				}
			)
		);
		expect(result).toEqual(offer(onChain()));
	});

	it.each([
		['offline', onChain({ status: 'Offline' })],
		['not participating', onChain({ status: 'NotParticipating' })],
		['already eligible', onChain({ incentiveEligible: true })],
		['no participation', onChain({ participation: undefined })],
		['no state proof key', onChain({}, { stateProofKey: undefined })],
		['an empty state proof key', onChain({}, { stateProofKey: new Uint8Array(0) })],
		['a short voting key', onChain({}, { voteParticipationKey: new Uint8Array(31) })],
		['expired keys', onChain({ round: BigInt(keys.lastRound + 1) })],
		['zero key dilution', onChain({}, { voteKeyDilution: 0n })],
		['an unsafe last round', onChain({}, { voteLastValid: 2n ** 53n })],
		['an unsafe first round', onChain({}, { voteFirstValid: 2n ** 60n })],
		['an unsafe key dilution', onChain({}, { voteKeyDilution: 2n ** 64n - 1n })],
		['an unsafe round', onChain({ round: 2n ** 53n + 1n })]
	])('offers nothing for %s', (_, input) => {
		expect(offer(input)).toEqual({ kind: 'none' });
	});

	it('offers nothing for keys that end this round', () => {
		expect(offer(onChain({ round: BigInt(keys.lastRound) }))).toEqual({ kind: 'none' });
	});

	it('offers keys only with more than the minimum rounds left', () => {
		expect(ONCHAIN_KEYREG_MIN_ROUNDS_LEFT).toBe(1000);
		const left = (rounds: number) => offer(onChain({ round: BigInt(keys.lastRound - rounds) }));
		expect(left(ONCHAIN_KEYREG_MIN_ROUNDS_LEFT)).toEqual({ kind: 'none' });
		expect(left(ONCHAIN_KEYREG_MIN_ROUNDS_LEFT + 1)).toMatchObject({
			kind: 'offer',
			roundsLeft: ONCHAIN_KEYREG_MIN_ROUNDS_LEFT + 1,
			expiringSoon: true
		});
	});

	it('offers keys valid from the next round at the latest', () => {
		const from = (first: number) => offer(onChain({}, { voteFirstValid: BigInt(first) }));
		expect(from(round + 1)).toMatchObject({ kind: 'offer', keys: { firstRound: round + 1 } });
		expect(from(round + 2)).toEqual({ kind: 'none' });
	});

	it.each(['checking', 'incapable', 'unverified'] as const)(
		'offers nothing to a staking contract that is %s',
		(contractIncentive) => {
			expect(
				offer(onChain(), { isStakingContract: true, contractIncentive, balanceRange })
			).toEqual({
				kind: 'none'
			});
		}
	);

	it('offers a capable staking contract its keys', () => {
		expect(
			offer(onChain(), { isStakingContract: true, contractIncentive: 'capable', balanceRange })
		).toMatchObject({ kind: 'offer', keys: { ...keys, parentAddress: address } });
	});

	it('marks keys ending within 30 days at the fallback block time as expiring soon', () => {
		expect(EXPIRING_SOON_SECONDS).toBe(30 * 24 * 60 * 60);
		const boundary = EXPIRING_SOON_SECONDS / FALLBACK_BLOCK_TIME;
		const under = Math.floor(boundary);
		const over = Math.ceil(boundary);
		expect(under).toBeLessThan(boundary);
		const at = (left: number) => offer(onChain({ round: BigInt(keys.lastRound - left) }));
		expect(at(under)).toMatchObject({ roundsLeft: under, expiringSoon: true });
		expect(at(over)).toMatchObject({ roundsLeft: over, expiringSoon: false });
	});

	// Eligibility persists, but block rewards are paid only inside the balance range: still offered.
	it.each([
		['below the range', BLOCK_REWARD_MIN_MICROVOI - 1, false],
		['at the minimum', BLOCK_REWARD_MIN_MICROVOI, true],
		['inside the range', 100_000_000_000, true],
		['at the maximum', BLOCK_REWARD_MAX_MICROVOI, true],
		['above the range', BLOCK_REWARD_MAX_MICROVOI + 1, false]
	])('offers an account %s and marks whether its balance is in range', (_, amount, inRange) => {
		for (const value of [amount, BigInt(amount)]) {
			expect(offer(onChain({ amount: value }))).toMatchObject({
				kind: 'offer',
				balanceInRange: inRange
			});
		}
	});

	it('does not mark an unknown balance out of range', () => {
		expect(offer(onChain({ amount: undefined }))).toMatchObject({
			kind: 'offer',
			balanceInRange: true
		});
	});
});

describe('formatMicroVoi', () => {
	it.each([
		[0, '0'],
		[1, '0.000001'],
		[1_000_000, '1'],
		[2_002_000, '2.002'],
		[100_000, '0.1'],
		[123_456_789, '123.456789']
	])('formats %d microVOI as %s VOI', (micro, text) => {
		expect(formatMicroVoi(micro)).toBe(text);
		expect(formatMicroVoi(BigInt(micro))).toBe(text);
	});

	it('is exact beyond the safe integer range', () => {
		expect(formatMicroVoi(10_000_000_000_000_000_001n)).toBe('10000000000000.000001');
	});
});

describe('signerShortfall', () => {
	it('is null when the account holds exactly the cost plus its minimum balance', () => {
		expect(signerShortfall({ amount: 1_102_000, minBalance: 100_000 }, 1_002_000)).toBeNull();
		expect(signerShortfall({ amount: 1_102_000n, minBalance: 100_000n }, 1_002_000)).toBeNull();
	});

	it('is null when the account holds more than needed', () => {
		expect(signerShortfall({ amount: 5_000_000n, minBalance: 100_000n }, 1000)).toBeNull();
	});

	it('reports one microVOI short of the cost plus the minimum balance', () => {
		for (const funds of [
			{ amount: 1_101_999, minBalance: 100_000 },
			{ amount: 1_101_999n, minBalance: 100_000n }
		]) {
			expect(signerShortfall(funds, 1_002_000)).toEqual({
				needed: 1_102_000n,
				have: 1_101_999n,
				cost: 1_002_000n,
				minBalance: 100_000n,
				shortfall: 1n
			});
		}
		expect(signerShortfall({ amount: 1_101_999n, minBalance: 100_000n }, 1_002_000n)).toEqual(
			expect.objectContaining({ shortfall: 1n })
		);
	});
});

describe('shortfallMessage', () => {
	const short = signerShortfall({ amount: 1_000_000n, minBalance: 100_000n }, 2_002_000)!;

	it('describes a registration the account cannot pay for', () => {
		expect(shortfallMessage(short, address, 'register')).toBe(
			'This account (AAAA…HFKQ) needs 2.102 VOI for this registration (2.002 VOI for the transaction plus its 0.1 VOI minimum balance) but holds 1 VOI. Add at least 1.102 VOI and try again. Nothing was sent.'
		);
	});

	it('describes going offline the account cannot pay for', () => {
		expect(shortfallMessage(short, address, 'offline')).toBe(
			'This account (AAAA…HFKQ) needs 2.102 VOI to go offline (2.002 VOI for the transaction plus its 0.1 VOI minimum balance) but holds 1 VOI. Add at least 1.102 VOI and try again. Nothing was sent.'
		);
	});
});

describe('participateGroupTxns', () => {
	const OVERSPEND =
		"The signing account doesn't hold enough VOI to cover this transaction and keep its minimum balance, so nothing was sent.";

	it('returns the txns of a successful result', () => {
		expect(participateGroupTxns({ success: true, txns: ['a', 'b'] })).toEqual(['a', 'b']);
		expect(participateGroupTxns({ txns: ['a', 'b'] })).toEqual(['a', 'b']);
	});

	it('turns an overspend simulate failure into a readable message', () => {
		const result = {
			success: false,
			error: new Error(
				'Network request error. Received status 400: transaction rejected: overspend (account X, data {amount: 1})'
			)
		};
		expect(() => participateGroupTxns(result)).toThrow(OVERSPEND);
	});

	it('turns any other failure into a readable message with its cause', () => {
		expect(() =>
			participateGroupTxns({ success: false, error: new Error('logic eval error') })
		).toThrow(
			"Couldn't prepare the staking contract transaction, so nothing was sent: logic eval error"
		);
	});

	it('turns a failure with no message into a readable message', () => {
		for (const result of [{ success: false }, undefined, null, {}, { txns: [1, 2] }]) {
			let thrown: unknown;
			try {
				participateGroupTxns(result);
			} catch (err) {
				thrown = err;
			}
			expect(thrown).toBeInstanceOf(Error);
			expect((thrown as Error).message).toBe(
				"Couldn't prepare the staking contract transaction, so nothing was sent."
			);
		}
	});

	it('never surfaces the undefined txns crash', () => {
		for (const result of [
			{ success: false, error: new Error('overspend') },
			{ success: false, error: new Error('other') },
			{ success: false },
			{ success: false, txns: ['a'] }
		]) {
			expect(() => participateGroupTxns(result)).toThrow(Error);
			try {
				participateGroupTxns(result);
			} catch (err) {
				expect((err as Error).message).not.toContain("reading 'map'");
			}
		}
	});
});
