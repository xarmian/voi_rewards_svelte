import { supabasePublicClient } from '$lib/supabase';
import type { IProject } from '$lib/data/types';

export const DIRECTORY_TIMEOUT_MS = 8000;

export async function fetchDirectoryProjects(): Promise<
	{ ok: true; projects: IProject[] } | { ok: false }
> {
	try {
		const { data, error } = await supabasePublicClient
			.from('vr_projects')
			.select('*')
			.abortSignal(AbortSignal.timeout(DIRECTORY_TIMEOUT_MS));

		if (error) throw error;
		return { ok: true, projects: data ?? [] };
	} catch (error) {
		console.error('Error fetching directory projects:', error);
		return { ok: false };
	}
}

export function directoryView({
	status,
	total,
	shown
}: {
	status: 'loading' | 'ok' | 'error';
	total: number;
	shown: number;
}): 'loading' | 'error' | 'empty' | 'no-match' | 'list' {
	if (status !== 'ok') return status;
	if (total === 0) return 'empty';
	if (shown === 0) return 'no-match';
	return 'list';
}
