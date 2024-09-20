import { supabasePublicClient } from '$lib/supabase';
import type { VRPhase2 } from '$lib/supabase';

export const load = async () => {
    const { data, error } = await supabasePublicClient
        .from('vr_phase2')
        .select('*')
        .order('total_quest_points', { ascending: false }).limit(50);

    // get count of number of rows in leaderboard table
    const { count, error: countError } = await supabasePublicClient
        .from('vr_phase2')
        .select('count', { count: 'exact' });

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
        ranks: data as VRPhase2[],
        total_accounts: count,
        pageMetaTags,
    };
};