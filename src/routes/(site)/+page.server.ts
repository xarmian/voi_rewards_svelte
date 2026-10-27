import type { RequestEvent } from '@sveltejs/kit';
import { loadHome } from '$lib/server/home';

export const load = ({ url, fetch }: Pick<RequestEvent, 'url' | 'fetch'>) => loadHome(url, fetch);
