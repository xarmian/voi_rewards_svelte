import type { Handle, RequestEvent } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import { beforeEach, expect, test, vi } from 'vitest';
import { handle } from './hooks.server';

vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://example.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'test-key'
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({})) }));

beforeEach(() => vi.clearAllMocks());

function request(path: string, method = 'GET') {
	const url = new URL(path, 'https://voirewards.com');
	const event = {
		url,
		request: new Request(url, { method }),
		locals: {},
		cookies: { getAll: vi.fn(() => []), set: vi.fn() },
		setHeaders: vi.fn()
	} as unknown as RequestEvent;
	const resolve = vi.fn<Parameters<Handle>[0]['resolve']>(async () => new Response('resolved'));
	return { event, resolve };
}

test.each([
	['/phase1?x=1', 308, '/archive/testnet/phase1?x=1'],
	['/arc72', 302, 'https://nftnavigator.xyz/']
] as const)(
	'%s redirects before creating a client or resolving',
	async (path, status, location) => {
		const { event, resolve } = request(path);
		const response = await handle({ event, resolve });
		expect(response.status).toBe(status);
		expect(response.headers.get('location')).toBe(location);
		expect(await response.text()).toBe('');
		expect(resolve).not.toHaveBeenCalled();
		expect(createServerClient).not.toHaveBeenCalled();
	}
);

test.each([
	['/directory', 'GET'],
	['/accounts', 'POST']
])('%s (%s) resolves normally', async (path, method) => {
	const { event, resolve } = request(path, method);
	const response = await handle({ event, resolve });
	expect(resolve).toHaveBeenCalledOnce();
	expect(createServerClient).toHaveBeenCalledOnce();
	expect(await response.text()).toBe('resolved');
});
