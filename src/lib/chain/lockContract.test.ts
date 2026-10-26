/* eslint-disable @typescript-eslint/no-explicit-any -- Verbatim legacy decoder references. */
import * as algosdk from 'algosdk';
import { describe, expect, it, vi } from 'vitest';

// Bodies copied verbatim from both components before extraction. Staking's
// address was captured from its component prop; pass it explicitly here.
function decodeLockVestState(state: any, address: string): Record<string, string | number> {
	const result: any = {
		contractAddress: address,
		contractId: 0
	};

	// Helper to decode addresses
	const decodeAddress = (bytes: Uint8Array): string => {
		return algosdk.encodeAddress(bytes);
	};

	// Helper to decode numbers
	const decodeNumber = (value: any): number => {
		if (value.type === 2) {
			// uint
			return value.uint;
		}
		// If it's bytes, decode as uint64
		return Number(algosdk.decodeUint64(Buffer.from(value.bytes, 'base64'), 'safe'));
	};

	// Helper to decode big numbers as strings
	const decodeBigNumber = (value: any): string => {
		if (value.type === 2) {
			// uint
			return value.uint.toString();
		}
		// If it's bytes, decode as uint64
		return algosdk.decodeUint64(Buffer.from(value.bytes, 'base64'), 'safe').toString();
	};

	// Map of key to decode function
	const decoders: { [key: string]: (value: any) => any } = {
		deployer: (v) => decodeAddress(Buffer.from(v.bytes, 'base64')),
		delegate: (v) => decodeAddress(Buffer.from(v.bytes, 'base64')),
		deadline: decodeNumber,
		distribution_count: decodeNumber,
		distribution_seconds: decodeNumber,
		funder: (v) => decodeAddress(Buffer.from(v.bytes, 'base64')),
		funding: decodeBigNumber,
		initial: decodeBigNumber,
		lockup_delay: decodeNumber,
		messenger_id: decodeNumber,
		owner: (v) => decodeAddress(Buffer.from(v.bytes, 'base64')),
		parent_id: decodeNumber,
		period: decodeNumber,
		period_limit: decodeNumber,
		period_seconds: decodeNumber,
		total: decodeBigNumber,
		vesting_delay: decodeNumber
	};

	// Decode each state value
	for (const item of state) {
		const key = Buffer.from(item.key, 'base64').toString();

		// Get the appropriate decoder
		const decoder = decoders[key];
		if (decoder) {
			try {
				// Add the global_ prefix to match our interface
				result[`global_${key}`] = decoder(item.value);
			} catch (err) {
				console.error(`Error decoding ${key}:`, err, item.value);
			}
		}
	}

	return result;
}

function decodeStakingState(state: any, address: string): Record<string, string | number> {
	const result: any = {
		contractAddress: address,
		contractId: 0
	};

	// Helper to decode addresses
	const decodeAddress = (bytes: Uint8Array): string => {
		return algosdk.encodeAddress(bytes);
	};

	// Helper to decode numbers
	const decodeNumber = (value: any): number => {
		if (value.type === 2) {
			// uint
			return value.uint;
		}
		// If it's bytes, decode as uint64
		return Number(algosdk.decodeUint64(Buffer.from(value.bytes, 'base64'), 'safe'));
	};

	// Helper to decode big numbers as strings
	const decodeBigNumber = (value: any): string => {
		if (value.type === 2) {
			// uint
			return value.uint.toString();
		}
		// If it's bytes, decode as uint64
		return algosdk.decodeUint64(Buffer.from(value.bytes, 'base64'), 'safe').toString();
	};

	// Map of key to decode function
	const decoders: { [key: string]: (value: any) => any } = {
		deployer: (v) => decodeAddress(Buffer.from(v.bytes, 'base64')),
		delegate: (v) => decodeAddress(Buffer.from(v.bytes, 'base64')),
		deadline: decodeNumber,
		distribution_count: decodeNumber,
		distribution_seconds: decodeNumber,
		funder: (v) => decodeAddress(Buffer.from(v.bytes, 'base64')),
		funding: decodeBigNumber,
		initial: decodeBigNumber,
		lockup_delay: decodeNumber,
		messenger_id: decodeNumber,
		owner: (v) => decodeAddress(Buffer.from(v.bytes, 'base64')),
		parent_id: decodeNumber,
		period: decodeNumber,
		period_limit: decodeNumber,
		period_seconds: decodeNumber,
		total: decodeBigNumber,
		vesting_delay: decodeNumber
	};

	// Decode each state value
	for (const item of state) {
		const key = Buffer.from(item.key, 'base64').toString();

		// Get the appropriate decoder
		const decoder = decoders[key];
		if (decoder) {
			try {
				// Add the global_ prefix to match our interface
				result[`global_${key}`] = decoder(item.value);
			} catch (err) {
				console.error(`Error decoding ${key}:`, err, item.value);
			}
		}
	}

	return result;
}

const address = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';
const bytes = (value: string) => ({ type: 1, bytes: value, uint: 0 });
const uint = (value: number) => ({ type: 2, bytes: '', uint: value });
const entry = (key: string, value: ReturnType<typeof uint>) => ({
	key: Buffer.from(key).toString('base64'),
	value
});
const uint64 = (value: number) => {
	const buffer = Buffer.alloc(8);
	buffer.writeBigUInt64BE(BigInt(value));
	return bytes(buffer.toString('base64'));
};
const fixture = [
	...['deployer', 'delegate', 'funder', 'owner'].map((key) =>
		entry(key, bytes(Buffer.alloc(32).toString('base64')))
	),
	entry('deadline', uint(1700000000)),
	entry('distribution_count', uint(12)),
	entry('distribution_seconds', uint64(86400)),
	entry('funding', uint(1690000000)),
	entry('initial', uint64(1234567890123)),
	entry('lockup_delay', uint(2)),
	entry('messenger_id', uint64(42)),
	entry('parent_id', uint(7)),
	entry('period', uint(3)),
	entry('period_limit', uint(24)),
	entry('period_seconds', uint(2592000)),
	entry('total', uint64(9876543210)),
	entry('vesting_delay', uint64(1)),
	entry('unknown', uint(999))
];
const expected = {
	contractAddress: address,
	contractId: 0,
	global_deployer: address,
	global_delegate: address,
	global_funder: address,
	global_owner: address,
	global_deadline: 1700000000,
	global_distribution_count: 12,
	global_distribution_seconds: 86400,
	global_funding: '1690000000',
	global_initial: '1234567890123',
	global_lockup_delay: 2,
	global_messenger_id: 42,
	global_parent_id: 7,
	global_period: 3,
	global_period_limit: 24,
	global_period_seconds: 2592000,
	global_total: '9876543210',
	global_vesting_delay: 1
};

for (const [component, decode] of [
	['LockVestComponent', decodeLockVestState],
	['StakingComponent', decodeStakingState]
] as const) {
	describe(`${component} lock-state characterization`, () => {
		it('decodes base64 keys, addresses, uints and byte-encoded uint64s', () => {
			expect(decode(fixture, address)).toEqual(expected);
		});
		it('leaves missing fields absent rather than assigning defaults', () => {
			expect(decode([], address)).toEqual({ contractAddress: address, contractId: 0 });
			expect(decode([], address).global_funding).toBeUndefined();
		});
		it('logs an invalid field and continues decoding other fields', () => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			try {
				expect(decode([entry('deadline', bytes('AAAAAAAAAAAA')), entry('total', uint(42))], address)).toEqual({
					contractAddress: address,
					contractId: 0,
					global_total: '42'
				});
				expect(error).toHaveBeenCalledWith(
					'Error decoding deadline:',
					expect.any(Error),
					bytes('AAAAAAAAAAAA')
				);
			} finally {
				error.mockRestore();
			}
		});
	});
}
