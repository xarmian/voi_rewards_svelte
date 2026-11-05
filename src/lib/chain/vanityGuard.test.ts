import { expect, test, vi } from 'vitest';
import { decideVanityStart, hasThirdPartyScript } from './vanityGuard';

test.each([
	[false, false, 'proceed'],
	[false, true, 'proceed'],
	[true, false, 'reload'],
	[true, true, 'blocked']
] as const)('thirdParty=%s, alreadyReloaded=%s gives %s', (thirdParty, alreadyReloaded, expected) => {
	expect(decideVanityStart({ thirdParty, alreadyReloaded })).toBe(expected);
});

test.each([
	[[], undefined, false],
	[['https://voirewards.com/app.js'], undefined, false],
	[['/app.js', './chunk.js'], undefined, false],
	[['/app.js', 'https://third-party.test/app.js'], undefined, true],
	[['//third-party.test/app.js'], undefined, true],
	[[], [], true],
	[[], null, true]
] as const)('detects scripts %j and dataLayer %j', (sources, dataLayer, expected) => {
	const querySelectorAll = vi.fn(() => sources.map((src) => ({ src })));
	expect(hasThirdPartyScript({ querySelectorAll }, 'https://voirewards.com', { dataLayer })).toBe(expected);
	if (dataLayer === undefined) expect(querySelectorAll).toHaveBeenCalledWith('script[src]');
});
