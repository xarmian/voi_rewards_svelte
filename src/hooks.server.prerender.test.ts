import type { Handle, RequestEvent } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import { beforeEach, expect, test, vi } from 'vitest';
import { handle } from './hooks.server';

// While SvelteKit builds, it prerenders pages through this hook. A prerendered page must never turn
// into a redirect, and SvelteKit forbids reading url.search then, so the redirect table is skipped.
vi.mock('$app/environment', () => ({ building: true, browser: false, dev: false }));
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://example.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'test-key'
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({})) }));

beforeEach(() => vi.clearAllMocks());

function request(path: string) {
	const url = new URL(path, 'https://voirewards.com');
	// Reading url.search is an error while prerendering; make the test event behave the same way.
	Object.defineProperty(url, 'search', {
		get() {
			throw new Error('Cannot access url.search on a page with prerendering enabled');
		}
	});
	const event = {
		url,
		request: new Request(url),
		locals: {},
		cookies: { getAll: vi.fn(() => []), set: vi.fn() },
		setHeaders: vi.fn()
	} as unknown as RequestEvent;
	const resolve = vi.fn<Parameters<Handle>[0]['resolve']>(async () => new Response('resolved'));
	return { event, resolve };
}

test.each(['/what_is_voi', '/phase1', '/ecosystem/Wallets', '/arc72', '/about'])(
	'%s resolves normally during a build and never reads url.search',
	async (path) => {
		const { event, resolve } = request(path);
		const response = await handle({ event, resolve });
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('resolved');
		expect(resolve).toHaveBeenCalledOnce();
		expect(createServerClient).toHaveBeenCalledOnce();
	}
);
