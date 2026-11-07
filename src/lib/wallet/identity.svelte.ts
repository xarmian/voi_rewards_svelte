import { browser } from '$app/environment';
import { untrack } from 'svelte';
import { fetchWalletIdentity } from './identity';

export function createWalletIdentity(getAddress: () => string, lookup = fetchWalletIdentity) {
	let name = $state<string | null>(null);
	let avatar = $state<string | null>(null);
	let sequence = 0;

	$effect.pre(() => {
		if (!browser) return;
		const address = getAddress();
		return untrack(() => {
			const request = ++sequence;
			name = null;
			avatar = null;
			if (address) {
				void (async () => {
					try {
						const identity = await lookup(address);
						if (request !== sequence) return;
						name = identity.name;
						avatar = identity.avatar;
					} catch {
						// Identity is optional; the hero keeps its fallback on failure.
					}
				})();
			}
			return () => {
				sequence++;
			};
		});
	});

	return {
		get name() {
			return name;
		},
		get avatar() {
			return avatar;
		}
	};
}
