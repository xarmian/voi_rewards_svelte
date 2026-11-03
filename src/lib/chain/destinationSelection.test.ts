import algosdk from 'algosdk';
import { describe, expect, it } from 'vitest';
import {
	emptyDestination,
	editDestination,
	selectDestinationName,
	unresolvedName,
	type NameKind
} from './destinationSelection';

const address = algosdk.encodeAddress(new Uint8Array(32));
const otherAddress = algosdk.encodeAddress(new Uint8Array(32).fill(1));
const rules = (kind: NameKind = 'envoi') => ({ kind, isValidAddress: algosdk.isValidAddress });

describe('destination selection', () => {
	it('accepts a typed valid address as the receiver', () => {
		expect(editDestination(emptyDestination, address, rules())).toEqual({
			text: address,
			address,
			name: null,
			error: null
		});
	});
	it('clears a selected name and receiver on edit, unless the edit is a valid address', () => {
		const picked = selectDestinationName(emptyDestination, { name: 'alice.voi', address }, rules());
		expect(editDestination(picked, 'bob', rules())).toEqual({
			text: 'bob',
			address: null,
			name: null,
			error: null
		});
		expect(editDestination(picked, otherAddress, rules())).toEqual({
			text: otherAddress,
			address: otherAddress,
			name: null,
			error: null
		});
		expect(editDestination(picked, '', rules())).toEqual(emptyDestination);
	});
	it('shows the selected name and retains its resolved receiver', () => {
		expect(
			selectDestinationName(
				{ ...emptyDestination, text: 'ali' },
				{ name: 'alice.voi', address },
				rules()
			)
		).toEqual({
			text: 'alice.voi',
			address,
			name: 'alice.voi',
			error: null
		});
	});
	it.each([undefined, null, '', 'malformed', address.slice(0, 57), address + 'A', 'A'.repeat(58)])(
		'blocks a name with an unusable resolved address: %s',
		(invalid) => {
			const state = selectDestinationName(
				emptyDestination,
				{ name: 'alice.voi', address: invalid },
				rules()
			);
			expect(state).toEqual({
				text: 'alice.voi',
				name: 'alice.voi',
				address: null,
				error: 'The name "alice.voi" did not resolve to an address, so it cannot be used.'
			});
		}
	);
	it.each([
		[
			'envoi',
			'x.algo',
			'That is an Algorand name. This field takes a Voi address or an enVoi (.voi) name.'
		],
		[
			'envoi',
			'x.ALGO',
			'That is an Algorand name. This field takes a Voi address or an enVoi (.voi) name.'
		],
		[
			'nfd',
			'x.voi',
			'That is a Voi name. This field takes an Algorand address or an NFDomain (.algo) name.'
		],
		[
			'nfd',
			'x.VOI',
			'That is a Voi name. This field takes an Algorand address or an NFDomain (.algo) name.'
		]
	] as const)('rejects a wrong-kind name in a %s field: %s', (kind, text, error) => {
		expect(editDestination(emptyDestination, text, rules(kind))).toEqual({
			text,
			address: null,
			name: null,
			error
		});
	});
	it.each(['nfd', 'envoi'] as const)('reports a name with no search match for %s', (kind) => {
		const text = kind === 'nfd' ? 'absent.algo' : 'absent.voi';
		expect(unresolvedName({ ...emptyDestination, text }, rules(kind))).toMatchObject({
			address: null,
			error: `No ${kind === 'nfd' ? 'NFDomain' : 'enVoi'} name matches "${text}".`
		});
		expect(unresolvedName({ ...emptyDestination, text: 'absent' }, rules(kind)).error).toBeNull();
	});
	it('never mutates its input', () => {
		const input = Object.freeze({ text: 'alice.voi', address, name: 'alice.voi', error: null });
		const before = { ...input };
		editDestination(input, 'other', rules());
		selectDestinationName(input, { name: 'other.voi', address: otherAddress }, rules());
		unresolvedName(input, rules());
		expect(input).toEqual(before);
		expect(emptyDestination).toEqual({ text: '', address: null, name: null, error: null });
	});
});
