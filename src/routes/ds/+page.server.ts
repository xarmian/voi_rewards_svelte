import { error } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';

// Design-system gallery (DESIGN-SYSTEM.md §4): on Vercel previews, or locally with
// PUBLIC_DS_GALLERY=1. Production returns 404.
export const load: PageServerLoad = () => {
	// The local flag only counts off Vercel, so it can never open the gallery on production.
	const vercelEnv = privateEnv.VERCEL_ENV;
	const enabled = vercelEnv ? vercelEnv === 'preview' : publicEnv.PUBLIC_DS_GALLERY === '1';
	if (!enabled) error(404, 'Not found');
	return {};
};
