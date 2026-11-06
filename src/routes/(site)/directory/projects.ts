import { supabasePublicClient } from '$lib/supabase';
import type { IProject } from '$lib/data/types';

export const DIRECTORY_TIMEOUT_MS = 8000;

export type FeedResult = { ok: true; projects: IProject[] } | { ok: false };
export type FeedState = {
	status: 'loading' | 'ok' | 'error' | 'stale';
	projects: IProject[];
	receivedAt: number | null;
};

export async function fetchDirectoryProjects(): Promise<FeedResult> {
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

const promotedCategories = ['Infrastructure', 'Tools', 'Wallets'];

export function categoryHref(category: string): string {
	return category === 'All' ? '/directory' : `/directory/${encodeURIComponent(category)}`;
}

export function orderCategories(categories: readonly string[]): string[] {
	const unique = [...new Set(categories)];
	return [
		'All',
		...promotedCategories,
		...unique.filter((category) => !['All', 'New', ...promotedCategories].includes(category)),
		'New'
	].filter((category) => unique.includes(category));
}

export function categoriesOf(activeProjects: readonly IProject[]): string[] {
	return orderCategories(['All', ...activeProjects.map((project) => project.category), 'New']);
}

export function orderProjects(projects: readonly IProject[]): IProject[] {
	const rank = (category: string) => {
		const index = promotedCategories.indexOf(category);
		return index === -1 ? promotedCategories.length : index;
	};
	return [...projects].sort((a, b) => rank(a.category) - rank(b.category));
}

export function filterProjects(
	projects: readonly IProject[],
	{ category, term }: { category: string; term: string }
): IProject[] {
	const query = term.toLowerCase();
	return projects.filter(
		(project) =>
			project.status === 'active' &&
			(category === 'All' ||
				(category === 'New' ? project.new === true : project.category === category)) &&
			[project.title, project.description, project.category].some((text) =>
				text.toLowerCase().includes(query)
			)
	);
}

export function nextFeedState(prev: FeedState, result: FeedResult, now: number): FeedState {
	if (result.ok) return { status: 'ok', projects: result.projects, receivedAt: now };
	if (prev.receivedAt !== null) return { ...prev, status: 'stale' };
	return { status: 'error', projects: [], receivedAt: null };
}

export function formatReceivedAt(receivedAt: number): string {
	return new Date(receivedAt).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
}

export function directoryView({
	status,
	total,
	shown
}: {
	status: FeedState['status'];
	total: number;
	shown: number;
}): 'loading' | 'error' | 'empty' | 'no-match' | 'list' {
	if (status === 'loading' || status === 'error') return status;
	if (total === 0) return 'empty';
	if (shown === 0) return 'no-match';
	return 'list';
}
