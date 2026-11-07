import { getEnvoiNames } from '$lib/utils/envoi';

type WalletIdentity = { name: string | null; avatar: string | null };
const NONE: WalletIdentity = { name: null, avatar: null };

// Both strings come from a third party and are shown on a page with signing actions, so anything that
// is not plainly a name is refused and the hero falls back to the address (it fails safe).
// A name is letters, numbers, combining marks, dots, hyphens and underscores; control, format,
// default-ignorable (zero-width, variation selectors, fillers) characters are refused first.
// Names that read as an account address (58 base32 characters, a long string with no dot, the
// hero's own short-address shape) and names that mix Latin with Cyrillic or Greek letters are refused.
// Whole-script look-alikes cannot be told from real names here; the full address stays below the heading.
const NAME_REFUSED = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;
const NAME_ALLOWED = /^[\p{L}\p{N}\p{M}._-]+$/u;
const MIXED_SCRIPT_A = /\p{Script=Latin}/u;
const MIXED_SCRIPT_B = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
const ADDRESS_LIKE = /^[A-Z2-7]{58}$/;
const NAME_MAX = 128;
const DOTLESS_MAX = 32;
const AVATAR_MAX = 2048;
const IPV4_LIKE = /^[\d.]+$/;

function validName(raw: string): string | null {
	const name = raw.trim();
	if (!name || name.length > NAME_MAX) return null;
	if (NAME_REFUSED.test(name) || !NAME_ALLOWED.test(name)) return null;
	if (!name.includes('.') && name.length > DOTLESS_MAX) return null;
	if (ADDRESS_LIKE.test(name.toUpperCase())) return null;
	const labels = name.split('.');
	// An empty label (`..`, a leading or trailing dot) is not a name, e.g. the short-address shape `G3MS...UIFQ`.
	if (labels.some((label) => label === '')) return null;
	// Latin mixed with Cyrillic or Greek inside ONE label is the look-alike pattern; `привет.voi` is fine.
	if (labels.some((label) => MIXED_SCRIPT_A.test(label) && MIXED_SCRIPT_B.test(label))) return null;
	return name;
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
		// WHATWG keeps a trailing dot (also from `%2e` or an ideographic full stop), which would slip past a
		// suffix check such as `.local`, and Chromium treats `localhost.` as loopback. A public image host
		// has a plain dotted name: no empty labels, no trailing dot, no IP literal (IPv6, or IPv4 in any
		// WHATWG form), no undotted name, no local name, none of which should be asked of the visitor's network.
		if (host.split('.').some((label) => label === '')) return null;
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
