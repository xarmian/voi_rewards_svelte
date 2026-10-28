import * as algosdk from 'algosdk';

// Keyreg input parsing and plain-account keyreg construction (TASK-67).
// Accepts `goal account partkeyinfo` output or an ARC-90 keyreg URI, as emitted by
// vnode and Voi Swarm's show-partkey-qr:
//   voi://net:<genesis-id>/<address>?type=keyreg&votekey=..&selkey=..[&sprfkey=..]
//     &votefst=<n>&votelst=<n>&votekd=<n>[&fee=<n>]

export interface ParsedKeys {
	parentAddress: string;
	firstRound: number;
	lastRound: number;
	keyDilution: number;
	selectionKey: string;
	votingKey: string;
	stateProofKey: string;
}

export type KeyregParseResult =
	| { ok: true; keys: ParsedKeys; fee: number | null }
	| { ok: false; error: string };

export const SITE_GENESIS_ID = 'voimain-v1.0';
export const MIN_KEYREG_FEE = 1000;
// Consensus v40 go-online fee that marks the account incentive-eligible (2 VOI).
export const INCENTIVE_KEYREG_FEE = 2_000_000;

const SITE_NETWORK = `Voi MainNet only (voi://net:${SITE_GENESIS_ID}/)`;
const KEY_PARAMS = ['votekey', 'selkey', 'sprfkey', 'votefst', 'votelst', 'votekd'] as const;

export function parseKeyregInput(text: string): KeyregParseResult {
	const input = text.trim();
	if (/^(voi|algorand):\/\//i.test(input)) return parseKeyregUri(input);
	const keys = parsePartkeyinfo(input);
	return keys
		? { ok: true, keys, fee: null }
		: { ok: false, error: 'Invalid clipboard content format' };
}

function parsePartkeyinfo(text: string): ParsedKeys | null {
	try {
		const lines = text.split('\n');
		const result: ParsedKeys = {
			parentAddress: '',
			firstRound: 0,
			lastRound: 0,
			keyDilution: 0,
			selectionKey: '',
			votingKey: '',
			stateProofKey: ''
		};

		for (const line of lines) {
			if (line.includes('Parent address:')) {
				result.parentAddress = line.split(':')[1].trim();
			} else if (line.includes('First round:')) {
				result.firstRound = parseInt(line.split(':')[1].trim());
			} else if (line.includes('Last round:')) {
				result.lastRound = parseInt(line.split(':')[1].trim());
			} else if (line.includes('Key dilution:')) {
				result.keyDilution = parseInt(line.split(':')[1].trim());
			} else if (line.includes('Selection key:')) {
				result.selectionKey = line.split(':')[1].trim();
			} else if (line.includes('Voting key:')) {
				result.votingKey = line.split(':')[1].trim();
			} else if (line.includes('State proof key:')) {
				result.stateProofKey = line.split(':')[1].trim();
			}
		}

		// Validate that we have all required fields
		if (
			!result.firstRound ||
			!result.lastRound ||
			!result.keyDilution ||
			!result.selectionKey ||
			!result.votingKey ||
			!result.stateProofKey
		) {
			throw new Error('Missing required fields in clipboard content');
		}

		return result;
	} catch (err) {
		console.error('Error parsing clipboard content:', err);
		return null;
	}
}

function fail(error: string): KeyregParseResult {
	return { ok: false, error };
}

function parseKeyregUri(input: string): KeyregParseResult {
	const [, scheme, rest] = input.match(/^(voi|algorand):\/\/(.*)$/is) ?? [];
	const network = rest.match(/^net:([^/?]*)\//i);
	const label = network ? network[1] : null;
	if (scheme.toLowerCase() !== 'voi' || label !== SITE_GENESIS_ID) {
		const found =
			label !== null
				? `the ${label} network`
				: scheme.toLowerCase() === 'algorand'
					? 'Algorand MainNet'
					: 'an unnamed network';
		return fail(`This keyreg URI is for ${found}; this site registers keys on ${SITE_NETWORK}.`);
	}

	const afterNetwork = rest.slice(network![0].length);
	const queryAt = afterNetwork.indexOf('?');
	const address = queryAt === -1 ? afterNetwork : afterNetwork.slice(0, queryAt);
	const query = new URLSearchParams(queryAt === -1 ? '' : afterNetwork.slice(queryAt + 1));

	const type = query.get('type');
	if (type !== 'keyreg') {
		return fail(`The URI's type must be "keyreg" (found ${type ? `"${type}"` : 'none'}).`);
	}
	if (!algosdk.isValidAddress(address)) {
		return fail('The URI does not contain a valid Voi address.');
	}
	if (KEY_PARAMS.every((name) => !query.has(name))) {
		return fail(
			'This is a go-offline keyreg URI. To take the account offline, use the Go Offline button.'
		);
	}
	for (const name of ['votekey', 'selkey', 'votefst', 'votelst', 'votekd']) {
		if (!query.has(name)) return fail(`The URI is missing ${name}.`);
	}
	if (!query.has('sprfkey')) {
		return fail('This key has no state proof key (sprfkey); registration requires one.');
	}

	const votingKey = base64UrlKey(query.get('votekey')!, 32);
	if (votingKey === null) return fail('votekey must be 32 bytes of base64url.');
	const selectionKey = base64UrlKey(query.get('selkey')!, 32);
	if (selectionKey === null) return fail('selkey must be 32 bytes of base64url.');
	const stateProofKey = base64UrlKey(query.get('sprfkey')!, 64);
	if (stateProofKey === null) return fail('sprfkey must be 64 bytes of base64url.');

	const rounds: Record<string, number> = {};
	for (const name of ['votefst', 'votelst', 'votekd']) {
		const value = wholeNumber(query.get(name)!);
		if (value === null) return fail(`${name} must be a whole number.`);
		rounds[name] = value;
	}
	if (rounds.votelst < rounds.votefst) {
		return fail(`votelst (${rounds.votelst}) is before votefst (${rounds.votefst}).`);
	}
	if (rounds.votekd === 0) return fail('votekd must be greater than 0.');

	let fee: number | null = null;
	if (query.has('fee')) {
		fee = wholeNumber(query.get('fee')!);
		if (fee === null || fee < MIN_KEYREG_FEE || fee > INCENTIVE_KEYREG_FEE) {
			return fail(
				`fee must be a whole number from ${MIN_KEYREG_FEE} to ${INCENTIVE_KEYREG_FEE} microVOI.`
			);
		}
	}

	return {
		ok: true,
		keys: {
			parentAddress: address,
			firstRound: rounds.votefst,
			lastRound: rounds.votelst,
			keyDilution: rounds.votekd,
			selectionKey,
			votingKey,
			stateProofKey
		},
		fee
	};
}

function wholeNumber(value: string): number | null {
	if (!/^\d+$/.test(value)) return null;
	const n = Number(value);
	return Number.isSafeInteger(n) ? n : null;
}

// Unpadded base64url -> the padded standard base64 that partkeyinfo prints, or null
// unless it decodes canonically to exactly `bytes` bytes.
function base64UrlKey(value: string, bytes: number): string | null {
	if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
	const standard = value.replace(/-/g, '+').replace(/_/g, '/');
	const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=');
	const decoded = Buffer.from(padded, 'base64');
	if (decoded.length !== bytes || decoded.toString('base64') !== padded) return null;
	return padded;
}

type KeyregParams = algosdk.SuggestedParams & { minFee?: number };

type OnlineKeyreg = Pick<
	ParsedKeys,
	'firstRound' | 'lastRound' | 'keyDilution' | 'selectionKey' | 'votingKey' | 'stateProofKey'
> & { offline?: false; fee?: number | null };

export type WalletKeyregInput = { params: KeyregParams; sender: string } & (
	| { offline: true }
	| OnlineKeyreg
);

// Always a flat fee: algod's suggested params come back with flatFee false, which
// makes algosdk treat `fee` as per-byte (TASK-67: 396000 online, 212000 offline).
export function buildWalletKeyregTxn(input: WalletKeyregInput): algosdk.Transaction {
	const minFee = input.params.minFee ?? MIN_KEYREG_FEE;
	if (input.offline) {
		return algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
			from: input.sender,
			nonParticipation: true,
			suggestedParams: { ...input.params, fee: minFee, flatFee: true }
		});
	}
	return algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
		from: input.sender,
		voteKey: Buffer.from(input.votingKey, 'base64'),
		selectionKey: Buffer.from(input.selectionKey, 'base64'),
		stateProofKey: Buffer.from(input.stateProofKey, 'base64'),
		voteFirst: input.firstRound,
		voteLast: input.lastRound,
		voteKeyDilution: input.keyDilution,
		suggestedParams: { ...input.params, fee: input.fee ?? minFee, flatFee: true }
	});
}
