import { fetchProjects } from '../phase2/[...slug]/projects';
import type { PageServerLoad } from './$types';

export const load = (async () => {
	const projects = await fetchProjects();
	const pageMetaTags = {
		title: 'Voi Testnet Quests',
		description: 'Get Your Quest On, with the Voi Testnet Network',
		imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png'
	};

	return {
		projects,
		pageMetaTags
	};
}) satisfies PageServerLoad;
