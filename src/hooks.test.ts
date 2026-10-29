import { expect, it, vi } from 'vitest';

it.each<[string, string | undefined]>([
	['https://quests.voirewards.com/', '/quests'],
	['https://quests.voirewards.com/quests/abc', undefined],
	['https://voirewards.com/', undefined],
	['https://www.voirewards.com/', undefined]
])('reroutes %s to %s', async (url, expected) => {
	// Load inside each case so a missing universal hook fails every case.
	const hooksPath = './hooks';
	const { reroute } = await import(hooksPath);
	const fetcher = vi.fn<typeof fetch>();
	expect(await reroute({ url: new URL(url), fetch: fetcher })).toBe(expected);
	expect(fetcher).not.toHaveBeenCalled();
});
