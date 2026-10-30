import { afterEach, expect, it, vi } from 'vitest';

const environment = vi.hoisted(() => ({ browser: true }));
vi.mock('$app/environment', () => environment);
import { load } from './+page';

const event = (fetcher: unknown) => ({
	url: new URL('https://example.test/faq'),
	fetch: fetcher,
	data: { faqData: [] }
}) as never;

afterEach(() => { environment.browser = true; });

it('returns immediately with a pending posts promise when Medium never responds', async () => {
	let result: Awaited<ReturnType<typeof load>> | undefined;
	const pending = Promise.resolve(load(event(vi.fn(() => new Promise(() => {}))))).then((value) => { result = value; });
	for (let i = 0; i < 10; i++) await Promise.resolve();
	expect(result).toBeDefined();
	await pending;
	expect(result!.lastFivePosts).toBeInstanceOf(Promise);
	let settled = false;
	Promise.resolve(result!.lastFivePosts).then(() => { settled = true; });
	await Promise.resolve();
	expect(settled).toBe(false);
});

it.each(['reject', 'non-json', 'non-array', 'throw', 'http error'])('posts resolve to [] on %s', async (failure) => {
	const fetcher = vi.fn(() => {
		if (failure === 'throw') throw new Error('failed');
		if (failure === 'reject') return Promise.reject(new Error('failed'));
		return Promise.resolve(failure === 'non-json' ? new Response('broken') : Response.json({}, { status: failure === 'http error' ? 503 : 200 }));
	});
	const result = await load(event(fetcher));
	expect(await result!.lastFivePosts).toEqual([]);
});

it('SSR renders FAQ without starting a Medium request that hydration would repeat', async () => {
	environment.browser = false;
	const fetcher = vi.fn(() => new Promise(() => {}));
	let result: Awaited<ReturnType<typeof load>> | undefined;
	Promise.resolve(load(event(fetcher))).then((value) => { result = value; });
	for (let i = 0; i < 10; i++) await Promise.resolve();
	expect(result).toBeDefined();
	expect(fetcher).not.toHaveBeenCalled();
	expect(await result!.lastFivePosts).toEqual([]);
});
