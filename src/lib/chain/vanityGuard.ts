export function hasThirdPartyScript(
	doc: { querySelectorAll(selector: string): ArrayLike<{ src: string }> },
	origin: string,
	win: { dataLayer?: unknown }
): boolean {
	return (
		win.dataLayer !== undefined ||
		Array.from(doc.querySelectorAll('script[src]')).some(
			(script) => new URL(script.src, origin).origin !== origin
		)
	);
}

export function decideVanityStart(input: {
	thirdParty: boolean;
	alreadyReloaded: boolean;
}): 'proceed' | 'reload' | 'blocked' {
	if (!input.thirdParty) return 'proceed';
	return input.alreadyReloaded ? 'blocked' : 'reload';
}
