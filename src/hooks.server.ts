import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
import { withDeadline } from '$lib/server/fetchWithTimeout';

// TASK-85: Bound the entire auth validation so stalled requests cannot hold page loads.
const AUTH_TIMEOUT_MS = 3000;

export const handle: Handle = async ({ event, resolve }) => {
	const authAbort = new AbortController();
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		global: {
			fetch: (input, init) =>
				globalThis.fetch(input, {
					...init,
					signal: init?.signal ? AbortSignal.any([init.signal, authAbort.signal]) : authAbort.signal
				})
		},
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (list) =>
				list.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				})
		}
	});

	// TASK-54: Share lazy validation across concurrent and later consumers in this request.
	let sessionPromise: ReturnType<App.Locals['safeGetSession']> | undefined;
	event.locals.safeGetSession = () => {
		sessionPromise ??= withDeadline(async (signal) => {
			signal.addEventListener('abort', () => authAbort.abort(signal.reason), { once: true });
			const {
				data: { session }
			} = await event.locals.supabase.auth.getSession();
			if (!session) {
				return { session: null, user: null };
			}

			const {
				data: { user },
				error
			} = await event.locals.supabase.auth.getUser();
			if (error) {
				return { session: null, user: null };
			}

			return { session, user };
		}, AUTH_TIMEOUT_MS).catch((error) => {
			if (error instanceof DOMException && error.name === 'TimeoutError') {
				return { session: null, user: null };
			}
			throw error;
		});
		return sessionPromise;
	};
	event.locals.getUser = async () => (await event.locals.safeGetSession()).user;

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
