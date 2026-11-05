import algosdk from 'algosdk';

export type VanityRequest = { prefix: string; suffix: string; maxAttempts: number };
export type VanityMessage =
	| { type: 'progress'; attempts: number; lastAddressChecked: string }
	| { type: 'result'; address: string; mnemonic: string; attempts: number }
	| { type: 'maxAttempts'; attempts: number; lastAddressChecked: string };

export function runVanitySearch(
	request: VanityRequest,
	post: (message: VanityMessage) => void
): void {
	const prefixLower = request.prefix.toLowerCase();
	const suffixLower = request.suffix.toLowerCase();
	let attempts = 0;
	let lastAddressChecked = '';

	while (attempts < request.maxAttempts) {
		const account = algosdk.generateAccount();
		const address = account.addr.toString();
		attempts++;
		lastAddressChecked = address;

		if (attempts % 1000 === 0) {
			post({ type: 'progress', attempts, lastAddressChecked });
		}

		const addressLower = address.toLowerCase();
		const matchesPrefix = !prefixLower || addressLower.startsWith(prefixLower);
		const matchesSuffix = !suffixLower || addressLower.endsWith(suffixLower);
		if (matchesPrefix && matchesSuffix) {
			post({
				type: 'result',
				address,
				mnemonic: algosdk.secretKeyToMnemonic(account.sk),
				attempts
			});
			return;
		}
	}

	post({ type: 'maxAttempts', attempts, lastAddressChecked });
}
