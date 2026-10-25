import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies, depends }) => {
	// TASK-54 r1: invalidate('supabase:auth') must re-validate the user here too
	depends('supabase:auth');
	const { session, user } = await locals.safeGetSession();
	// TASK-54 r1: only the Supabase auth cookies reach page data; other cookies (HttpOnly ones
	// included) must never be serialized into the HTML or __data.json
	return {
		session,
		user,
		cookies: cookies.getAll().filter(({ name }) => name.startsWith('sb-'))
	};
};
