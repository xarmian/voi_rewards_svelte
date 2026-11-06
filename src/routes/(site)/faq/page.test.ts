import { afterEach, expect, it, vi } from 'vitest';
import { faqData } from '$lib/faqData';

const environment = vi.hoisted(() => ({ browser: true }));
vi.mock('$app/environment', () => environment);
import { load } from './+page';

type LoadResult = Exclude<Awaited<ReturnType<typeof load>>, void>;
const event = (fetcher: unknown, hash = '') =>
	({
		url: new URL(`https://example.test/faq${hash}`),
		fetch: fetcher,
		data: { faqData }
	}) as never;

afterEach(() => {
	environment.browser = true;
});

it.each([true, false])('loads FAQ without fetching when browser is %s', async (browser) => {
	environment.browser = browser;
	const fetcher = vi.fn(() => Promise.resolve(Response.json([])));
	const result = (await load(event(fetcher))) as LoadResult;
	expect(fetcher).not.toHaveBeenCalled();
	expect(result).not.toHaveProperty('lastFivePosts');
	expect(result.faqData).toBe(faqData);
	expect(result.recentFAQs).toEqual(faqData.filter((item) => item.recent === 'true').slice(0, 3));
});

it('uses a legacy hash for the highlighted FAQ and meta title', async () => {
	const question = 'Can **Locked** or Non-vested Voi tokens earn block rewards?';
	const result = (await load(
		event(vi.fn(), '#can-locked-or-non-vested-voi-tokens-earn-block-rewards-')
	)) as LoadResult;
	expect(result.highlightedFAQ).toBe(faqData.find((item) => item.question === question));
	expect(result.pageMetaTags.title).toBe(`FAQ: ${question} | Voi Network`);
});

it('keeps the default title and a null highlight for an unknown hash', async () => {
	const result = (await load(event(vi.fn(), '#no-such-question'))) as LoadResult;
	expect(result.highlightedFAQ).toBeNull();
	expect(result.pageMetaTags.title).toBe('Frequently Asked Questions | Voi Network');
});
