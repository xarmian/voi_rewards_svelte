import { getEnvoiNames } from '$lib/utils/envoi';

type WalletIdentity = { name: string | null; avatar: string | null };
const NONE: WalletIdentity = { name: null, avatar: null };

// Both strings come from a third party and are shown on a page with signing actions.
// Control, format (bidi overrides and isolates, zero-width) and line or paragraph separator characters
// are refused, and so is a name that could be read as an account address.
const NAME_REFUSED = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const ADDRESS_LIKE = /^[A-Z2-7]{58}$/;
const NAME_MAX = 128;
const AVATAR_MAX = 2048;
const IPV4_LIKE = /^[\d.]+$/;

function validName(raw: string): string | null {
	const name = raw.trim();
	if (!name || name.length > NAME_MAX || NAME_REFUSED.test(name)) return null;
	return ADDRESS_LIKE.test(name.toUpperCase()) ? null : name;
}

// Returns the PARSED href, never the raw string: a string such as `https:../api/x` is a valid https URL
// to `new URL(s)` with a host of `..`, but the browser resolves an <img src> against the page and would
// load a same-origin path. The raw string must also start with `https://`, so no form relies on that.
function validAvatar(raw: unknown): string | null {
	if (typeof raw !== 'string' || raw.length === 0 || raw.length > AVATAR_MAX) return null;
	if (!/^https:\/\//i.test(raw)) return null;
	try {
		const url = new URL(raw);
		if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
		const host = url.hostname;
		// A public image host has a dotted name: refuse IP literals (IPv6 or IPv4 in any WHATWG form),
		// names without a dot and local names, which would ask the visitor's network to answer.
		if (!host.includes('.') || host.startsWith('[') || IPV4_LIKE.test(host)) return null;
		if (/\.(local|localhost|internal)$/i.test(host)) return null;
		return url.href;
	} catch {
		return null;
	}
}

export function parseWalletIdentity(address: string, results: unknown): WalletIdentity {
	const result = Array.isArray(results)
		? results.find(
				(result) =>
					result?.address === address && typeof result.name === 'string' && result.name.trim()
			)
		: undefined;
	if (!result) return NONE;

	const name = validName(result.name);
	// A record whose name is refused is not trusted at all, so its avatar goes too.
	if (name === null) return NONE;
	return { name, avatar: validAvatar(result.metadata?.avatar) };
}

export async function fetchWalletIdentity(
	address: string,
	lookup: (addresses: string[]) => Promise<unknown> = getEnvoiNames
): Promise<WalletIdentity> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const results = await Promise.race([
			lookup([address]),
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), 5000);
			})
		]);
		return parseWalletIdentity(address, results);
	} catch {
		return NONE;
	} finally {
		clearTimeout(timer);
	}
}
