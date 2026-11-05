import algosdk from 'algosdk';
import { expect, test } from 'vitest';
import { runVanitySearch, type VanityMessage } from './vanitySearch';

test.each(['', 'a'])(
	'finds a suffix with prefix %j using real accounts',
	(prefix) => {
		const messages: VanityMessage[] = [];
		runVanitySearch({ prefix, suffix: 'a', maxAttempts: 200000 }, (message) => {
			expect(
				typeof (message.type === 'result' ? message.address : message.lastAddressChecked)
			).toBe('string');
			messages.push(message);
		});
		const result = messages.at(-1);
		expect(result?.type).toBe('result');
		if (result?.type !== 'result') throw new Error('No matching account');
		expect(typeof result.address).toBe('string');
		expect(result.address).toBe(result.address.toUpperCase());
		expect(result.address.toLowerCase().startsWith(prefix)).toBe(true);
		expect(result.address.toLowerCase().endsWith('a')).toBe(true);
		expect(algosdk.mnemonicToSecretKey(result.mnemonic).addr.toString()).toBe(result.address);
		expect(messages.filter((message) => message.type === 'result')).toHaveLength(1);
	},
	60000
);

test('reports progress every thousand attempts and stops at the limit', () => {
	const messages: VanityMessage[] = [];
	runVanitySearch({ prefix: 'AAAAAAAAAA', suffix: '', maxAttempts: 2500 }, (message) => {
		expect(typeof (message.type === 'result' ? message.address : message.lastAddressChecked)).toBe(
			'string'
		);
		messages.push(message);
	});
	expect(messages).toEqual([
		{ type: 'progress', attempts: 1000, lastAddressChecked: expect.any(String) },
		{ type: 'progress', attempts: 2000, lastAddressChecked: expect.any(String) },
		{ type: 'maxAttempts', attempts: 2500, lastAddressChecked: expect.any(String) }
	]);
}, 60000);
