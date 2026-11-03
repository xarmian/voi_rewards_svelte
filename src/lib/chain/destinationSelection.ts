export type NameKind = 'nfd' | 'envoi';
export type DestinationState = {
	text: string;
	address: string | null;
	name: string | null;
	error: string | null;
};
type DestinationRules = { isValidAddress(v: string): boolean; kind: NameKind };

export const emptyDestination: DestinationState = {
	text: '',
	address: null,
	name: null,
	error: null
};

export function editDestination(
	state: DestinationState,
	text: string,
	rules: DestinationRules
): DestinationState {
	if (rules.isValidAddress(text)) return { text, address: text, name: null, error: null };
	let error: string | null = null;
	if (rules.kind === 'envoi' && /\.algo$/i.test(text)) {
		error = 'That is an Algorand name. This field takes a Voi address or an enVoi (.voi) name.';
	} else if (rules.kind === 'nfd' && /\.voi$/i.test(text)) {
		error = 'That is a Voi name. This field takes an Algorand address or an NFDomain (.algo) name.';
	}
	return { ...state, text, address: null, name: null, error };
}

export function selectDestinationName(
	state: DestinationState,
	picked: { name: string; address: string | null | undefined },
	rules: DestinationRules
): DestinationState {
	const address =
		picked.address?.length === 58 && rules.isValidAddress(picked.address) ? picked.address : null;
	return {
		...state,
		text: picked.name,
		name: picked.name,
		address,
		error: address
			? null
			: `The name "${picked.name}" did not resolve to an address, so it cannot be used.`
	};
}

export function unresolvedName(state: DestinationState, rules: DestinationRules): DestinationState {
	return {
		...state,
		address: null,
		error: state.text.includes('.')
			? `No ${rules.kind === 'nfd' ? 'NFDomain' : 'enVoi'} name matches "${state.text}".`
			: null
	};
}

/** True when the field holds a name the user picked, as opposed to an address they typed. */
export function pickedName(state: DestinationState): boolean {
	return Boolean(state.address && state.name && state.text === state.name);
}
