import { supabasePublicClient, type PLeaderboard } from '$lib/supabase';
import { fetchProjects } from '../../phase2/[...slug]/projects';

export const load = async ({ params }) => {
    const { slug } = params;
    const parts = slug.split('/');
    const wallet = (parts[0] && parts[0] === '_') ? '' : parts[0] ?? '';

    const projects = await fetchProjects();
    const project = projects.find((p) => p.column === parts[1]) ?? projects.find((p) => p.id === Number(parts[1]));
    const projectId = project?.id ?? 0;

    let leaderboardData: PLeaderboard | undefined;

    if (wallet.length > 0) {
        const { data, error } = await supabasePublicClient
        .from('leaderboard')
        .select('*')
        .eq('wallet', wallet);

        if (!error) {
            leaderboardData = data && data[0];
        }
    }

    const pageMetaTags = {
        title: 'Voi TestNet Phase 2 Quest Tracker',
        description: 'Get Your Quest On, with the Voi Testnet Network',
        imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png',
    };

    if (project) {
        pageMetaTags.title += ` | ${project.title}`;
        pageMetaTags.description = project.description;
        pageMetaTags.imageUrl = project.logo ? ('https://voirewards.com' + project.logo.replace(/\.(svg|webp)$/, '.png')) : 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png';
    }

    return {
        props: {
            wallet,
            projectId,
            leaderboardData,
            projects,
        },
        pageMetaTags,
    };
};