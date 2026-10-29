import { afterEach, beforeEach, expect, test, vi } from 'vitest';
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

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test.each(['getUser', 'getSession'] as const)(
	'%s stall: validation stays pending until 3000 ms and shares the signed-out result',
	async (stalledCall) => {
		vi.useFakeTimers();
		getSession.mockResolvedValue({ data: { session } });
		if (stalledCall === 'getUser') {
			getUser.mockImplementation(() => new Promise<never>(() => {}));
		} else {
			getSession.mockImplementation(() => new Promise<never>(() => {}));
		}
		const event = request(true);
		await handle({ event, resolve: async () => new Response() });
		const first = event.locals.safeGetSession();
		const second = event.locals.safeGetSession();
		expect(second).toBe(first);
		const settled = vi.fn();
		void first.then(settled);

		await vi.advanceTimersByTimeAsync(2999);
		expect(settled).not.toHaveBeenCalled();
		expect(getSession).toHaveBeenCalledTimes(1);
		expect(getUser).toHaveBeenCalledTimes(stalledCall === 'getUser' ? 1 : 0);

		await vi.advanceTimersByTimeAsync(1);
		const results = await Promise.all([first, second]);
		expect(results).toEqual([
			{ session: null, user: null },
			{ session: null, user: null }
		]);
		expect(results[1]).toBe(results[0]);
		expect(event.locals.safeGetSession()).toBe(first);
		expect(await event.locals.getUser()).toBeNull();
		expect(getSession).toHaveBeenCalledTimes(1);
		expect(getUser).toHaveBeenCalledTimes(stalledCall === 'getUser' ? 1 : 0);
	}
);

test('fast validation leaves no deadline timer', async () => {
	vi.useFakeTimers();
	getSession.mockResolvedValue({ data: { session } });
	const event = request(true);
	await handle({ event, resolve: async () => new Response() });
	expect(await event.locals.safeGetSession()).toEqual({ session, user });
	expect(vi.getTimerCount()).toBe(0);
});

test.each([
	new Error('getUser failed'),
	Object.assign(new Error('not a DOMException'), { name: 'TimeoutError' }),
	new DOMException('an upstream timeout, not the deadline', 'TimeoutError')
])('a thrown getUser error propagates: %s', async (error) => {
	getSession.mockResolvedValue({ data: { session } });
	getUser.mockRejectedValue(error);
	const event = request(true);
	await handle({ event, resolve: async () => new Response() });
	await expect(event.locals.safeGetSession()).rejects.toBe(error);
});

test('custom fetch forwards options and combines the caller signal', async () => {
	await handle({ event: request(true), resolve: async () => new Response() });
	const fetch = vi.mocked(createServerClient).mock.calls[0][2].global!.fetch!;
	const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response());
	vi.stubGlobal('fetch', fetchMock);

	await fetch('https://example.invalid/auth/v1/user');
	const signal = fetchMock.mock.calls[0][1]?.signal;
	expect(signal).toBeInstanceOf(AbortSignal);
	expect(signal!.aborted).toBe(false);

	const caller = new AbortController();
	const init = { signal: caller.signal, method: 'POST', headers: { 'x-test': 'value' } };
	await fetch('https://example.invalid/auth/v1/token', init);
	expect(fetchMock).toHaveBeenLastCalledWith('https://example.invalid/auth/v1/token', {
		...init,
		signal: expect.any(AbortSignal)
	});
	const combined = fetchMock.mock.calls[1][1]!.signal!;
	expect(combined.aborted).toBe(false);
	const reason = new Error('caller cancelled');
	caller.abort(reason);
	expect(combined.aborted).toBe(true);
	expect(combined.reason).toBe(reason);
	expect(signal!.aborted).toBe(false);
});

test('custom fetch receives the deadline TimeoutError after a getUser stall', async () => {
	vi.useFakeTimers();
	getSession.mockResolvedValue({ data: { session } });
	getUser.mockImplementation(() => new Promise<never>(() => {}));
	const event = request(true);
	await handle({ event, resolve: async () => new Response() });
	const fetch = vi.mocked(createServerClient).mock.calls[0][2].global!.fetch!;
	const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response());
	vi.stubGlobal('fetch', fetchMock);
	await fetch('https://example.invalid/auth/v1/user');
	const inFlightSignal = fetchMock.mock.calls[0][1]!.signal!;
	expect(inFlightSignal.aborted).toBe(false);

	const result = event.locals.safeGetSession();
	await vi.advanceTimersByTimeAsync(3000);
	expect(await result).toEqual({ session: null, user: null });
	await fetch('https://example.invalid/auth/v1/user');
	const signal = fetchMock.mock.calls[1][1]!.signal!;
	expect(signal.aborted).toBe(true);
	expect(signal.reason).toBeInstanceOf(DOMException);
	expect(signal.reason.name).toBe('TimeoutError');
	expect(inFlightSignal.aborted).toBe(true);
	expect(inFlightSignal.reason).toBe(signal.reason);
});

test('after the deadline, only auth requests are aborted; data queries keep their own signal', async () => {
	vi.useFakeTimers();
	getSession.mockResolvedValue({ data: { session } });
	getUser.mockImplementation(() => new Promise<never>(() => {}));
	const event = request(true);
	await handle({ event, resolve: async () => new Response() });
	const fetch = vi.mocked(createServerClient).mock.calls[0][2].global!.fetch!;
	const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response());
	vi.stubGlobal('fetch', fetchMock);

	const result = event.locals.safeGetSession();
	await vi.advanceTimersByTimeAsync(3000);
	expect(await result).toEqual({ session: null, user: null });

	await fetch('https://example.invalid/rest/v1/items?select=*');
	expect(fetchMock.mock.calls[0][1]).toBeUndefined();
	const caller = new AbortController();
	const init = { signal: caller.signal, method: 'GET' };
	await fetch(new URL('https://example.invalid/rest/v1/items'), init);
	expect(fetchMock.mock.calls[1][1]).toBe(init);
	expect(caller.signal.aborted).toBe(false);

	await fetch(new URL('https://example.invalid/auth/v1/user'));
	await fetch(new Request('https://example.invalid/auth/v1/token?grant_type=refresh_token'));
	for (const call of fetchMock.mock.calls.slice(2)) {
		expect(call[1]!.signal!.aborted).toBe(true);
		expect(call[1]!.signal!.reason.name).toBe('TimeoutError');
	}
});
