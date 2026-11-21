import { safeAvatarUrl } from '$lib/utils/avatarUrl';
import { getEnvoiNames } from '$lib/utils/envoi';

type WalletIdentity = { name: string | null; avatar: string | null };
const NONE: WalletIdentity = { name: null, avatar: null };

// Both strings come from a third party and are shown on a page with signing actions, so only a plain
// name is shown and anything else makes the hero fall back to the address (it fails safe).
// Blocking look-alike characters one class at a time never finishes, so the rule is an allowlist: dotted
// labels of lower-case ASCII letters, digits, hyphens and underscores (each label starting and ending with
// a letter or digit, at most 63 characters), ending in the `voi` label. That leaves no character that can
// pass for a dot, a letter of another script, a space, or (by being upper case) an `l`. The whole name is
// at most 56 characters, which is shorter than an account address (58), so however an address is split
// or its characters swapped it cannot fit in the heading.
// A name outside this form (other scripts, emoji, upper case) is not shown; the page keeps the short
// address, and the full address stays on the page under the heading.
const NAME_ALLOWED = /^(?:[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)+voi$/;
const NAME_MAX = 56;

function validName(raw: string): string | null {
	const name = raw.trim();
	if (!name || name.length > NAME_MAX) return null;
	if (!NAME_ALLOWED.test(name)) return null;
	return name;
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
	return { name, avatar: safeAvatarUrl(result.metadata?.avatar) };
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
