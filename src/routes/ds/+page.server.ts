import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';

// Design-system gallery (DESIGN-SYSTEM.md §4). Only on Preview, where PUBLIC_DS_GALLERY=1.
export const load: PageServerLoad = () => {
	if (env.PUBLIC_DS_GALLERY !== '1') error(404, 'Not found');
	return {};
};
