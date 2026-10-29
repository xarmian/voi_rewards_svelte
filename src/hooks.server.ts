import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
import { withDeadline } from '$lib/server/fetchWithTimeout';

// TASK-85: Bound the entire auth validation so stalled requests cannot hold page loads.
const AUTH_TIMEOUT_MS = 3000;
// TASK-85 r1: Only auth requests share the validation deadline; data queries keep their own signal.
const AUTH_URL_PREFIX = `${PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/`;

function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === 'string') return input;
	return input instanceof URL ? input.href : input.url;
}

export const handle: Handle = async ({ event, resolve }) => {
	const authAbort = new AbortController();
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		global: {
			fetch: (input, init) => {
				if (!requestUrl(input).startsWith(AUTH_URL_PREFIX)) {
					return globalThis.fetch(input, init);
				}
				return globalThis.fetch(input, {
					...init,
					signal: init?.signal ? AbortSignal.any([init.signal, authAbort.signal]) : authAbort.signal
				});
			}
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
	// TASK-85 r1: withDeadline rejects with the same reason it aborts with, so identity marks our timeout.
	let deadlineReason: unknown;
	event.locals.safeGetSession = () => {
		sessionPromise ??= withDeadline(async (signal) => {
			signal.addEventListener(
				'abort',
				() => {
					deadlineReason = signal.reason;
					authAbort.abort(signal.reason);
				},
				{ once: true }
			);
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
			if (deadlineReason !== undefined && error === deadlineReason) {
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
