import { getEnvoiNames } from '$lib/utils/envoi';

type WalletIdentity = { name: string | null; avatar: string | null };

export function parseWalletIdentity(address: string, results: unknown): WalletIdentity {
	const result = Array.isArray(results)
		? results.find(
				(result) =>
					result?.address === address && typeof result.name === 'string' && result.name.trim()
			)
		: undefined;
	if (!result) return { name: null, avatar: null };

	const name = result.name.trim();
	const avatar = result.metadata?.avatar;
	if (typeof avatar === 'string' && avatar.length > 0 && avatar.length <= 2048) {
		try {
			const url = new URL(avatar);
			if (url.protocol === 'https:' && !url.username && !url.password) {
				return { name, avatar };
			}
		} catch {
			// An invalid avatar must not discard the account's name.
		}
	}
	return { name, avatar: null };
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
		return { name: null, avatar: null };
	} finally {
		clearTimeout(timer);
	}
}
