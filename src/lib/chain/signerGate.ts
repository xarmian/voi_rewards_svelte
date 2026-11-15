export type PageAccountState<T> =
	| { state: 'yours'; signingEntry: T }
	| { state: 'watch-only' }
	| { state: 'read-only' };

export function pageAccountState<T extends { address: string; app: string }>(
	pageAddress: string | null | undefined,
	connected: readonly T[]
): PageAccountState<T> {
	if (!pageAddress) return { state: 'read-only' };
	const signingEntry = connected.find(
		(entry) => entry.address === pageAddress && !!entry.app && entry.app !== 'Watch'
	);
	if (signingEntry) return { state: 'yours', signingEntry };
	const watched = connected.some((entry) => entry.address === pageAddress && entry.app === 'Watch');
	return { state: watched ? 'watch-only' : 'read-only' };
}

export function signerMatchesAccount(
	signer: { address: string },
	accountAddress: string | null | undefined
): boolean {
	return !!accountAddress && signer.address === accountAddress;
}

export function wrongSignerMessage(): string {
	return "This page's account isn't connected in a signing wallet. Nothing was signed.";
}
