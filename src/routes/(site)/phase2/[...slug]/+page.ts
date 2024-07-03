import { supabasePublicClient, type PLeaderboard } from '$lib/supabase';

export const load = async ({ params }) => {
    const { slug } = params;

    const parts = slug.split('/');
	const wallet = parts[0]??'';
    const projectId = Number(parts[1]??0);
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
    };

    return {
        props: {
            wallet,
            projectId,
            pageMetaTags,
            leaderboardData,
        },
    };
};