import { ABIType } from 'algosdk';
import { describe, expect, it } from 'vitest';
import {
	EventType,
	calculateEventSelector,
	decodeBase64Log,
	identifyEventType,
	isDepositOrWithdrawEvent,
	decodeDepositEvent,
	decodeWithdrawEvent,
	decodeAltDepositEvent,
	decodeAltWithdrawEvent
} from './arc200Events';

const address = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';
function log(selector: string, layout: string, values: Parameters<ABIType['encode']>[0]) {
	return Buffer.concat([Buffer.from(selector, 'hex'), ABIType.from(layout).encode(values)]);
}

// Characterization of the moved decoders, including their existing alternate-layout assumptions.
describe('ARC200 event decoding', () => {
	it.each([
		['arc200_Transfer', ['address', 'address', 'uint256'], '79f88824'],
		['arc200_Approval', ['address', 'address', 'uint256'], '8c5be1e5'],
		[
			'Swap',
			['address', '(uint256,uint256)', '(uint256,uint256)', '(uint256,uint256)'],
			'c42079f9'
		],
		['Deposit', ['address', '(uint256,uint256)', 'uint256', '(uint256,uint256)'], '73d468a3'],
		['Withdraw', ['address', 'uint256', '(uint256,uint256)', '(uint256,uint256)'], '9b1bfa7f'],
		[
			'Deposit',
			['address', '(uint64,uint64)', 'uint64', '(uint64,uint64)', '(uint64,uint64)'],
			'3d013e7d'
		],
		[
			'Withdraw',
			['address', 'uint64', '(uint64,uint64)', '(uint64,uint64)', '(uint64,uint64)'],
			'2c3e5eff'
		],
		['Deposit', [], '192a776c'],
		['Withdraw', [], '151f7c75']
	])('keeps the selector for %s(%s)', (name, types, selector) => {
		expect(calculateEventSelector(name as string, types as string[])).toBe(selector);
	});

	it('identifies an ABI-encoded Transfer and decodes base64 unchanged', () => {
		const transfer = log('79f88824', '(address,address,uint256)', [address, address, 123n]);
		expect(decodeBase64Log(transfer.toString('base64'))).toEqual(transfer);
		expect(identifyEventType(transfer)).toBe(EventType.TRANSFER);
		expect(isDepositOrWithdrawEvent(transfer)).toEqual({ isDeposit: false, isWithdraw: false });
	});

	it('decodes uint256 Deposit and Withdraw fields', () => {
		const deposit = log('73d468a3', '(address,(uint256,uint256),uint256,(uint256,uint256))', [
			address,
			[10n, 20n],
			3n,
			[100n, 200n]
		]);
		const withdraw = log('9b1bfa7f', '(address,uint256,(uint256,uint256),(uint256,uint256))', [
			address,
			3n,
			[10n, 20n],
			[100n, 200n]
		]);
		expect(decodeDepositEvent(deposit)).toEqual({
			sender: '0x' + '00'.repeat(32),
			inAmts: [10n, 20n],
			outLpt: 3n,
			poolBals: [100n, 200n]
		});
		expect(decodeWithdrawEvent(withdraw)).toEqual({
			sender: '0x' + '00'.repeat(32),
			inLpt: 3n,
			outAmts: [10n, 20n],
			poolBals: [100n, 200n]
		});
		expect(identifyEventType(deposit)).toBe(EventType.DEPOSIT);
		expect(identifyEventType(withdraw)).toBe(EventType.WITHDRAW);
		expect(isDepositOrWithdrawEvent(deposit)).toEqual({ isDeposit: true, isWithdraw: false });
		expect(isDepositOrWithdrawEvent(withdraw)).toEqual({ isDeposit: false, isWithdraw: true });
	});

	it('keeps the alternate decoders’ 32-byte slots and extra reserves tuple', () => {
		const deposit = log(
			'3d013e7d',
			'(address,(uint256,uint256),uint256,(uint256,uint256),(uint256,uint256))',
			[address, [10n, 20n], 3n, [100n, 200n], [90n, 180n]]
		);
		const withdraw = log(
			'2c3e5eff',
			'(address,uint256,(uint256,uint256),(uint256,uint256),(uint256,uint256))',
			[address, 3n, [10n, 20n], [100n, 200n], [90n, 180n]]
		);
		expect(decodeAltDepositEvent(deposit)).toMatchObject({
			inAmts: [10n, 20n],
			outLpt: 3n,
			poolBals: [100n, 200n],
			reserves: [90n, 180n]
		});
		expect(decodeAltWithdrawEvent(withdraw)).toMatchObject({
			inLpt: 3n,
			outAmts: [10n, 20n],
			poolBals: [100n, 200n],
			reserves: [90n, 180n]
		});
		expect(identifyEventType(deposit)).toBe(EventType.DEPOSIT);
		expect(identifyEventType(withdraw)).toBe(EventType.WITHDRAW);
		// A real compact uint64 ABI payload is too short for today's alternate decoders.
		expect(
			decodeAltDepositEvent(
				log('3d013e7d', '(address,(uint64,uint64),uint64,(uint64,uint64),(uint64,uint64))', [
					address,
					[10n, 20n],
					3n,
					[100n, 200n],
					[90n, 180n]
				])
			)
		).toBeNull();
		expect(
			decodeAltWithdrawEvent(
				log('2c3e5eff', '(address,uint64,(uint64,uint64),(uint64,uint64),(uint64,uint64))', [
					address,
					3n,
					[10n, 20n],
					[100n, 200n],
					[90n, 180n]
				])
			)
		).toBeNull();
	});

	it('returns null or false for a short log', () => {
		const short = Buffer.from([1, 2, 3]);
		expect(identifyEventType(short)).toBeNull();
		expect(isDepositOrWithdrawEvent(short)).toEqual({ isDeposit: false, isWithdraw: false });
		for (const decode of [
			decodeDepositEvent,
			decodeWithdrawEvent,
			decodeAltDepositEvent,
			decodeAltWithdrawEvent
		]) {
			expect(decode(short)).toBeNull();
		}
	});
});
