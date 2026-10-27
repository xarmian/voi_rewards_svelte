import { searchEnvoi, getEnvoiAddresses, type EnvoiSearchResult } from '$lib/utils/envoi';
export type Suggestion = { address: string; name?: string; avatar?: string };
export type Resolution = { ok: true; address: string } | { ok: false; message: string };
export type Resolver = {
	suggest(query: string): Promise<Suggestion[]>;
	resolve(input: string, picked?: Suggestion): Promise<Resolution>;
	recents(): string[];
	remember(address: string): void;
};
export type ResolverOptions = {
	search?: (query: string) => Promise<EnvoiSearchResult[]>;
	lookup?: (name: string) => Promise<string[]>;
	storage?: Pick<Storage, 'getItem' | 'setItem'>;
	loadValidator?: () => Promise<(address: string) => boolean>;
};
export const isAddress = (input: string) => /^[A-Z2-7]{58}$/.test(input.trim());
let checksumValidator: Promise<(address: string) => boolean> | undefined;
const loadChecksumValidator = () =>
	(checksumValidator ??= import('algosdk').then(({ isValidAddress }) => isValidAddress));
const key = 'ds-recent-wallets';
export function createResolver({
	search = searchEnvoi,
	lookup = getEnvoiAddresses,
	storage,
	loadValidator = loadChecksumValidator
}: ResolverOptions = {}): Resolver {
	let validator: Promise<(address: string) => boolean> | undefined;
	async function valid(address: string) {
		return isAddress(address) && (await (validator ??= loadValidator()))(address.trim());
	}
	// Access to the localStorage property itself can throw in private/sandboxed contexts.
	function read(name: string) {
		try {
			return (storage ?? globalThis.localStorage)?.getItem(name) ?? null;
		} catch {
			return null;
		}
	}
	function write(addresses: string[]) {
		try {
			(storage ?? globalThis.localStorage)?.setItem(key, JSON.stringify(addresses));
		} catch {
			/* Storage is optional. */
		}
	}
	let seeded = false;
	function recents(): string[] {
		const saved = read(key);
		if (saved === null) {
			if (seeded) return [];
			seeded = true;
			const legacy = read('searchText');
			const initial = legacy && isAddress(legacy) ? [legacy.trim()] : [];
			write(initial);
			return initial;
		}
		seeded = true;
		try {
			const parsed: unknown = JSON.parse(saved);
			return Array.isArray(parsed)
				? [
						...new Set(
							parsed
								.filter((s): s is string => typeof s === 'string' && isAddress(s))
								.map((s) => s.trim())
						)
					].slice(0, 5)
				: [];
		} catch {
			return [];
		}
	}
	return {
		async suggest(query) {
			try {
				return (await search(query.trim()))
					.filter((s) => isAddress(s.address))
					.map((s) => ({ address: s.address.trim(), name: s.name, avatar: s.metadata?.avatar }));
			} catch {
				return [];
			}
		},
		async resolve(input, picked) {
			input = input.trim();
			const failure: Resolution = { ok: false, message: `No wallet found for "${input}"` };
			try {
				if (picked)
					return (await valid(picked.address))
						? { ok: true, address: picked.address.trim() }
						: failure;
				if (isAddress(input)) return (await valid(input)) ? { ok: true, address: input } : failure;
				if (!input) return { ok: false, message: 'Enter a wallet address or enVoi name' };
				const [address] = await lookup(input);
				return address && (await valid(address)) ? { ok: true, address: address.trim() } : failure;
			} catch {
				return failure;
			}
		},
		recents,
		remember(address) {
			if (isAddress(address)) {
				address = address.trim();
				write([address, ...recents().filter((a) => a !== address)].slice(0, 5));
			}
		}
	};
}
