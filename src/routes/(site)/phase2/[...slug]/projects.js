import { supabasePublicClient } from '$lib/supabase';

export async function fetchProjects() {
	const [{ data: projectsData, error: projectsError }, { data: questsData, error: questsError }] =
		await Promise.all([
			supabasePublicClient.from('vr_projects').select('*'),
			supabasePublicClient.from('vr_quests').select('*')
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
