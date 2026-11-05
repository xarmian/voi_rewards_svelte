import type { Handle, RequestEvent } from '@sveltejs/kit';
import { expect, test, vi } from 'vitest';
import { handle } from './hooks.server';

vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://example.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'test-key'
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({})) }));

function request(path: string) {
	const setHeaders = vi.fn();
	const event = {
		url: new URL(path, 'https://voirewards.com'),
		locals: {},
		cookies: { getAll: vi.fn(() => []), set: vi.fn() },
		setHeaders
	} as unknown as RequestEvent;
	const resolve = vi.fn<Parameters<Handle>[0]['resolve']>(async () => new Response());
	return { event, resolve, setHeaders };
}

test.each(['/vanity', '/vanity/nested'])(
	'%s sets CSP and transforms inline scripts using the same nonce',
	async (path) => {
		const { event, resolve, setHeaders } = request(path);
		await handle({ event, resolve });
		expect(setHeaders).toHaveBeenCalledOnce();
		const policy = setHeaders.mock.calls[0][0]['content-security-policy'] as string;
		const nonce = policy.match(/'nonce-([A-Za-z0-9+/]{22}==)'/)?.[1];
		expect(nonce).toBeDefined();
		expect(setHeaders).toHaveBeenCalledWith({
			'content-security-policy': `script-src 'self' 'nonce-${nonce}'; worker-src 'self'; object-src 'none'; base-uri 'self'`
		});
		expect(resolve).toHaveBeenCalledOnce();
		const options = resolve.mock.calls[0][1];
		expect(
			await options?.transformPageChunk?.({ html: '<script>start()</script>', done: true })
		).toBe(`<script nonce="${nonce}">start()</script>`);
		expect(options?.filterSerializedResponseHeaders?.('content-range', 'value')).toBe(true);
		expect(options?.filterSerializedResponseHeaders?.('x-supabase-api-version', 'value')).toBe(
			true
		);
		expect(options?.filterSerializedResponseHeaders?.('other', 'value')).toBe(false);
	}
);

test.each(['/', '/wallet/x', '/vanityfoo'])(
	'%s keeps its existing response options without CSP',
	async (path) => {
		const { event, resolve, setHeaders } = request(path);
		await handle({ event, resolve });
		expect(setHeaders).not.toHaveBeenCalled();
		expect(resolve).toHaveBeenCalledOnce();
		expect(resolve.mock.calls[0][1]).not.toHaveProperty('transformPageChunk');
	}
);
