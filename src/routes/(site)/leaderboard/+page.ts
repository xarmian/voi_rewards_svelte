import { supabasePublicClient } from '$lib/supabase';
import type { PLeaderboard } from '$lib/supabase';

export const load = async () => {
    const { data, error } = await supabasePublicClient
        .from('leaderboard')
        .select('*')
        .order('total', { ascending: false });

    if (error) {
        console.error(error);
        return {
            status: 500,
            error: new Error('Failed to fetch leaderboard data'),
        };
    }

    const pageMetaTags = {
        title: 'Voi TestNet Phase 2 Leaderboard',
    };

    return {
        ranks: data as PLeaderboard[],
        props: {
            pageMetaTags,
        },
    };
};