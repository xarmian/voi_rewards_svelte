import { beforeEach, expect, test, vi } from 'vitest';
import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { handle } from './hooks.server';

vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://example.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'test-key'
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));

const user: User = {
	id: 'test-user',
	app_metadata: {},
	user_metadata: {},
	aud: 'authenticated',
	created_at: '2026-01-01T00:00:00Z'
};
const session: Session = {
	access_token: 'test-access-token',
	refresh_token: 'test-refresh-token',
	expires_in: 3600,
	token_type: 'bearer',
	user
};
const getSession = vi.fn(
	async (): Promise<{ data: { session: Session | null } }> => ({
		data: { session: null }
	})
);
const getUser = vi.fn(
	async (): Promise<{ data: { user: User | null }; error: Error | null }> => ({
		data: { user },
		error: null
	})
);

beforeEach(() => {
	vi.clearAllMocks();
	getSession.mockResolvedValue({ data: { session: null } });
	getUser.mockResolvedValue({ data: { user }, error: null });
	vi.mocked(createServerClient).mockReturnValue({
		auth: { getSession, getUser }
	} as unknown as SupabaseClient);
});

function request(withAuthCookie = false): RequestEvent {
	const values = withAuthCookie ? [{ name: 'sb-test-auth-token', value: 'test-session' }] : [];
	return {
		locals: {},
		cookies: {
			get: vi.fn((name: string) => values.find((cookie) => cookie.name === name)?.value),
			getAll: vi.fn(() => values),
			set: vi.fn(),
			delete: vi.fn()
		}
	} as unknown as RequestEvent;
}

async function simulateLoads(event: RequestEvent) {
	const results = await Promise.all([event.locals.safeGetSession(), event.locals.safeGetSession()]);
	expect(results[0]).toEqual(results[1]);
	expect(await event.locals.getUser()).toEqual(results[0].user);
	return results[0];
}

test('no auth cookie: repeated session and user reads make zero getUser calls', async () => {
	await handle({
		event: request(),
		resolve: async (event) => {
			expect(getUser).not.toHaveBeenCalled();
			expect(await simulateLoads(event)).toEqual({ session: null, user: null });
			return new Response();
		}
	});
	expect(getSession).toHaveBeenCalledTimes(1);
	expect(getUser).not.toHaveBeenCalled();
});

test('auth cookie: concurrent session reads and getUser share one validation', async () => {
	getSession.mockResolvedValue({ data: { session } });
	await handle({
		event: request(true),
		resolve: async (event) => {
			expect(await simulateLoads(event)).toEqual({ session, user });
			return new Response();
		}
	});
	expect(getSession).toHaveBeenCalledTimes(1);
	expect(getUser).toHaveBeenCalledTimes(1);
});

test('no session consumer: the hook makes zero getSession and getUser calls', async () => {
	await handle({ event: request(true), resolve: async () => new Response() });
	expect(getSession).not.toHaveBeenCalled();
	expect(getUser).not.toHaveBeenCalled();
});

test('separate requests each validate once without sharing memoized sessions', async () => {
	getSession.mockResolvedValue({ data: { session } });
	for (let count = 1; count <= 2; count++) {
		await handle({
			event: request(true),
			resolve: async (event) => {
				expect(await simulateLoads(event)).toEqual({ session, user });
				return new Response();
			}
		});
		expect(getSession).toHaveBeenCalledTimes(count);
		expect(getUser).toHaveBeenCalledTimes(count);
	}
});

test('cookie rotation forwards every cookie and its options with root path', async () => {
	const event = request(true);
	await handle({ event, resolve: async () => new Response() });
	const cookies = vi.mocked(createServerClient).mock.calls[0][2].cookies as CookieMethodsServer;
	expect(cookies.getAll()).toEqual(event.cookies.getAll());
	await cookies.setAll!([
		{
			name: 'sb-test-auth-token.0',
			value: 'rotated-0',
			options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/old' }
		},
		{ name: 'sb-test-auth-token.1', value: 'rotated-1', options: { maxAge: 3600 } }
	]);
	expect(event.cookies.set).toHaveBeenCalledTimes(2);
	expect(event.cookies.set).toHaveBeenNthCalledWith(1, 'sb-test-auth-token.0', 'rotated-0', {
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		path: '/'
	});
	expect(event.cookies.set).toHaveBeenNthCalledWith(2, 'sb-test-auth-token.1', 'rotated-1', {
		maxAge: 3600,
		path: '/'
	});
});

test('getUser error returns a null session and user for every consumer', async () => {
	getSession.mockResolvedValue({ data: { session } });
	getUser.mockResolvedValue({ data: { user: null }, error: new Error('Invalid session') });
	await handle({
		event: request(true),
		resolve: async (event) => {
			expect(await simulateLoads(event)).toEqual({ session: null, user: null });
			return new Response();
		}
	});
	expect(getSession).toHaveBeenCalledTimes(1);
	expect(getUser).toHaveBeenCalledTimes(1);
});
