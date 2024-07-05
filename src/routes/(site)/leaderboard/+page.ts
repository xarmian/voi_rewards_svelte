import { supabasePublicClient } from '$lib/supabase';
import type { PLeaderboard } from '$lib/supabase';

export const load = async () => {
    const { data, error } = await supabasePublicClient
        .from('leaderboard')
        .select('*')
        .order('row_number', { ascending: true }).limit(100);

    // get count of number of rows in leaderboard table
    const { count, error: countError } = await supabasePublicClient
        .from('leaderboard')
        .select('count', { count: 'exact' });

    const { data: totalPoints } = await supabasePublicClient
        .from('leaderboard_sum')
        .select('total_points');

    if (error || countError) {
        console.error(error, countError);
        return {
            status: 500,
            error: new Error('Failed to fetch leaderboard data'),
        };
    }

    const pageMetaTags = {
        title: 'Voi TestNet Phase 2 Leaderboard',
        description: 'Get Your Quest On, with the Voi Testnet Network',
        imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png',
    };

    return {
        ranks: data as PLeaderboard[],
        total_accounts: count,
        total_points: totalPoints && totalPoints[0]?.total_points || 0,
        pageMetaTags,
    };
};