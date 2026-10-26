import * as algosdk from 'algosdk';

interface GlobalStateValue {
	type: number;
	bytes: string;
	uint: number;
}

interface GlobalStateEntry {
	key: string;
	value: GlobalStateValue;
}

export interface LockContractState {
	contractAddress: string;
	contractId: number;
	global_deployer?: string;
	global_delegate?: string;
	global_deadline?: number;
	global_distribution_count?: number;
	global_distribution_seconds?: number;
	global_funder?: string;
	global_funding?: string;
	global_initial?: string;
	global_lockup_delay?: number;
	global_messenger_id?: number;
	global_owner?: string;
	global_parent_id?: number;
	global_period?: number;
	global_period_limit?: number;
	global_period_seconds?: number;
	global_total?: string;
	global_vesting_delay?: number;
}

const decodeAddress = (value: GlobalStateValue): string =>
	algosdk.encodeAddress(Buffer.from(value.bytes, 'base64'));

const decodeNumber = (value: GlobalStateValue): number => {
	if (value.type === 2) return value.uint;
	return Number(algosdk.decodeUint64(Buffer.from(value.bytes, 'base64'), 'safe'));
};

const decodeBigNumber = (value: GlobalStateValue): string => {
	if (value.type === 2) return value.uint.toString();
	return algosdk.decodeUint64(Buffer.from(value.bytes, 'base64'), 'safe').toString();
};

const decoders: Record<string, (value: GlobalStateValue) => string | number> = {
	deployer: decodeAddress,
	delegate: decodeAddress,
	deadline: decodeNumber,
	distribution_count: decodeNumber,
	distribution_seconds: decodeNumber,
	funder: decodeAddress,
	funding: decodeBigNumber,
	initial: decodeBigNumber,
	lockup_delay: decodeNumber,
	messenger_id: decodeNumber,
	owner: decodeAddress,
	parent_id: decodeNumber,
	period: decodeNumber,
	period_limit: decodeNumber,
	period_seconds: decodeNumber,
	total: decodeBigNumber,
	vesting_delay: decodeNumber
};

export function decodeLockContractState(
	state: readonly GlobalStateEntry[],
	address: string
): LockContractState {
	const result: LockContractState & Record<string, string | number | undefined> = {
		contractAddress: address,
		contractId: 0
	};

	// Missing, unknown and undecodable fields remain absent, as in both consumers.
	for (const item of state) {
		const key = Buffer.from(item.key, 'base64').toString();
		const decoder = decoders[key];
		if (decoder) {
			try {
				result[`global_${key}`] = decoder(item.value);
			} catch (err) {
				console.error(`Error decoding ${key}:`, err, item.value);
			}
		}
	}

	return result;
}
