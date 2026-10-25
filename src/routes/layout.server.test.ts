import { expect, test, vi } from 'vitest';
import { load } from './+layout.server';

// TASK-54 r1: the root server load must serialize only Supabase auth cookies and re-run on auth changes.
test('root server load returns only sb-* cookies and depends on supabase:auth', async () => {
	const depends = vi.fn();
	const result = await load({
		depends,
		locals: { safeGetSession: async () => ({ session: null, user: null }) },
		cookies: {
			getAll: () => [
				{ name: 'sb-ref-auth-token', value: 'auth' },
				{ name: 'sb-ref-auth-token.0', value: 'chunk0' },
				{ name: 'sb-ref-auth-token-code-verifier', value: 'pkce' },
				{ name: 'admin_session', value: 'secret' },
				{ name: '_vercel_jwt', value: 'preview' }
			]
		}
	} as never);

	expect(result).toEqual({
		session: null,
		user: null,
		cookies: [
			{ name: 'sb-ref-auth-token', value: 'auth' },
			{ name: 'sb-ref-auth-token.0', value: 'chunk0' },
			{ name: 'sb-ref-auth-token-code-verifier', value: 'pkce' }
		]
	});
	expect(depends).toHaveBeenCalledWith('supabase:auth');
});
