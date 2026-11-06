import { supabasePublicClient } from '$lib/supabase';

// TASK-92: also runs in the browser (QuestsPage, ecosystem, QuestComponent), so no $lib/server import; matches
// UPSTREAM_TIMEOUT_MS. A timed-out query resolves with an error, which keeps the [] contract below.
const PROJECTS_TIMEOUT_MS = 5000;

export async function fetchProjects() {
	const [{ data: projectsData, error: projectsError }, { data: questsData, error: questsError }] =
		await Promise.all([
			supabasePublicClient
				.from('vr_projects')
				.select('*')
				.abortSignal(AbortSignal.timeout(PROJECTS_TIMEOUT_MS)),
			supabasePublicClient
				.from('vr_quests')
				.select('*')
				.abortSignal(AbortSignal.timeout(PROJECTS_TIMEOUT_MS))
		]);

	if (projectsError) {
		console.error('Error fetching projects:', projectsError);
		return [];
	}

	if (questsError) {
		console.error('Error fetching quests:', questsError);
		return [];
	}

	// Combine projects with their quests
	const projects = projectsData.map((project) => ({
		...project,
		quests: questsData.filter((quest) => quest.project === project.id)
	}));

	return projects;
}

export default fetchProjects;
