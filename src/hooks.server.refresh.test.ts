import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { handle } from './hooks.server';

// TASK-85 r1: the real @supabase/ssr client, so an expired session drives auth-js's own refresh.
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://example.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'test-key'
}));

const STORAGE_KEY = 'sb-example-auth-token';

type CookieWrite = { name: string; value: string; options: Record<string, unknown> };

function expiredSessionCookie() {
	const now = Math.floor(Date.now() / 1000);
	const stored = {
		access_token: 'expired-access-token',
		refresh_token: 'test-refresh-token',
		token_type: 'bearer',
		expires_in: 3600,
		expires_at: now - 600,
		user: {
			id: 'test-user',
			aud: 'authenticated',
			app_metadata: {},
			user_metadata: {},
			created_at: '2026-01-01T00:00:00Z'
		}
	};
	return 'base64-' + Buffer.from(JSON.stringify(stored)).toString('base64url');
}

function request() {
	const values = [{ name: STORAGE_KEY, value: expiredSessionCookie() }];
	const writes: CookieWrite[] = [];
	const event = {
		locals: {},
		cookies: {
			get: vi.fn((name: string) => values.find((cookie) => cookie.name === name)?.value),
			getAll: vi.fn(() => values),
			set: vi.fn((name: string, value: string, options: Record<string, unknown>) => {
				writes.push({ name, value, options });
			}),
			delete: vi.fn()
		}
	} as unknown as RequestEvent;
	return { event, writes };
}

const removals = (writes: CookieWrite[]) =>
	writes.filter(({ value, options }) => value === '' || options.maxAge === 0);

beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test('a stalled refresh signs out at the deadline and removes no auth cookie', async () => {
	const urls: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			urls.push(String(input));
			return new Promise<never>((_, reject) => {
				const signal = init?.signal;
				if (signal?.aborted) return reject(signal.reason);
				signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
			});
		})
	);
	const { event, writes } = request();
	await handle({ event, resolve: async () => new Response() });

	const settled = vi.fn();
	const result = event.locals.safeGetSession();
	void result.then(settled);
	await vi.advanceTimersByTimeAsync(2999);
	expect(settled).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	expect(await result).toEqual({ session: null, user: null });
	expect(urls[0]).toBe('https://example.invalid/auth/v1/token?grant_type=refresh_token');

	// Let auth-js finish its retry loop on the aborted signal.
	await vi.advanceTimersByTimeAsync(60_000);
	expect(urls.length).toBeGreaterThan(1);
	expect(removals(writes)).toEqual([]);
	expect(event.cookies.delete).not.toHaveBeenCalled();
});

test('control: a rejected refresh token does remove the auth cookie', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(
			async () =>
				new Response(
					JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token' }),
					{ status: 400, headers: { 'content-type': 'application/json' } }
				)
		)
	);
	const { event, writes } = request();
	await handle({ event, resolve: async () => new Response() });

	expect(await event.locals.safeGetSession()).toEqual({ session: null, user: null });
	await vi.advanceTimersByTimeAsync(60_000);
	expect(removals(writes).map(({ name }) => name)).toContain(STORAGE_KEY);
});
