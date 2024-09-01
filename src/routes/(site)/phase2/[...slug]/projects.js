import { supabasePublicClient } from '$lib/supabase';

export async function fetchProjects() {
  // Fetch projects
  const { data: projectsData, error: projectsError } = await supabasePublicClient
    .from('vr_projects')
    .select('*');

  if (projectsError) {
    console.error('Error fetching projects:', projectsError);
    return [];
  }

  // Fetch quests
  const { data: questsData, error: questsError } = await supabasePublicClient
    .from('vr_quests')
    .select('*');

  if (questsError) {
    console.error('Error fetching quests:', questsError);
    return [];
  }

  // Combine projects with their quests
  const projects = projectsData.map(project => ({
    ...project,
    quests: questsData.filter(quest => quest.project === project.id)
  }));

  return projects;
}

export default fetchProjects;