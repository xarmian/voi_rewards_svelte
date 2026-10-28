import * as algosdk from 'algosdk';
import { describe, expect, it, vi } from 'vitest';
import { buildWalletKeyregTxn, keyregAccount, keyregFee, parseKeyregInput } from './keyreg';

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
	const params = {
		fee: 0,
		minFee: 1000,
		flatFee: false,
		firstRound: 4000000,
		lastRound: 4001000,
		genesisID: 'voimain-v1.0',
		genesisHash: Buffer.alloc(32, 1).toString('base64')
	};
	const online = { params, sender: address, ...keys };

	it('uses the flat minimum fee online and preserves key material', () => {
		const txn = buildWalletKeyregTxn(online);
		expect(txn.fee).toBe(1000);
		expect(txn.flatFee).toBe(true);
		expect(new Uint8Array(txn.voteKey)).toEqual(new Uint8Array(voteBytes));
		expect(new Uint8Array(txn.selectionKey)).toEqual(new Uint8Array(selectionBytes));
		expect(new Uint8Array(txn.stateProofKey)).toEqual(new Uint8Array(stateProofBytes));
		expect(params).toMatchObject({ fee: 0, flatFee: false });
	});

	it('uses the flat incentive fee online', () => {
		const parsed = parseKeyregInput(uri({ fee: '2000000' }));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) throw new Error(parsed.error);
		const txn = buildWalletKeyregTxn({ params, sender: address, ...parsed.keys, fee: parsed.fee });
		expect(txn.fee).toBe(2000000);
		expect(txn.flatFee).toBe(true);
	});

	it('uses the flat minimum fee offline', () => {
		const txn = buildWalletKeyregTxn({ params, sender: address, offline: true });
		expect(txn.fee).toBe(1000);
		expect(txn.flatFee).toBe(true);
		expect(txn.nonParticipation).toBe(true);
	});

	it('raises a URI fee below the suggested minimum to that minimum', () => {
		const raised = { ...online, params: { ...params, minFee: 1500 }, fee: 1000 };
		expect(buildWalletKeyregTxn(raised).fee).toBe(1500);
	});

	it('uses a suggested minimum when supplied and falls back to 1000 when absent', () => {
		expect(buildWalletKeyregTxn({ ...online, params: { ...params, minFee: 1500 } }).fee).toBe(1500);
		expect(buildWalletKeyregTxn({ ...online, params: { ...params, minFee: undefined } }).fee).toBe(
			1000
		);
	});

	it('reproduces the old per-byte fee bug as a control', () => {
		const txn = algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
			from: address,
			voteKey: voteBytes,
			selectionKey: selectionBytes,
			stateProofKey: stateProofBytes,
			voteFirst: keys.firstRound,
			voteLast: keys.lastRound,
			voteKeyDilution: keys.keyDilution,
			suggestedParams: { ...params, fee: 1000, flatFee: false }
		});
		expect(txn.fee).toBeGreaterThan(1000);
	});
});

describe('account check (r2)', () => {
	const other = algosdk.generateAccount().addr;
	const appId = 40123456;
	const appAddress = algosdk.getApplicationAddress(appId);

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
