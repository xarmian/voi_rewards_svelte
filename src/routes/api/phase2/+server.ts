import { json } from '@sveltejs/kit';
import { supabasePublicClient } from '$lib/supabase';

//const systemPoints = 650988517.55; // $POINTS total supply
//const systemVoiPoints = 9034747.39; // $VOI total supply

const roleMultipliers = {
    'Phase 2': 10.0,
    'Phase 2-Manual': 10.0,
    'Recruit': 1.1,
    'Apprentice': 1.1,
    'Cadet': 1.1,
    'Seaman': 1.1,
    'Midshipman': 1.1,
    'Petty Officer': 1.1,
    'Ensign': 1.1,
    'Sub-Lieutenant': 1.1,
    'Lieutenant': 1.1,
    'Lieutenant-Commander': 1.1,
    'Commander': 1.1,
    'Captain': 1.1,
    'Commodore': 1.1,
    'Rear-Admiral': 1.1,
    'Vice-Admiral': 1.1,
    'Admiral': 1.1,
    'Fleet-Admiral': 1.1,
    'Senior Chief': 1.1,
    'Master Chief': 1.1,
    'Grand Voiager': 1.1,
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
    const wallet = url.searchParams.get('wallet');

    if (!wallet) {
        return json({ error: 'Missing required parameter: wallet' }, { 
            status: 400,
            headers: corsHeaders
        });
    }

    try {
        const { data: questData, error: questError } = await supabasePublicClient
            .from('vr_phase2')
            .select('*')
            .eq('address', wallet)
            .single();

        if (questError) throw questError;

        const { data: questList, error: questListError } = await supabasePublicClient
            .from('vr_quests')
            .select('*')
            .or('status.is.null,status.neq.inactive');

        if (questListError) throw questListError;

        let totalPoints = 0;
        let discordMultiplier = 1;
        let humanMultiplier = 1;

        // Calculate total points
        if (questData?.quest_data) {
            for (const [quest, value] of Object.entries(questData.quest_data)) {
                if (value) {
                    totalPoints += Number(value) * (questList.find(q => q.id === Number(quest))?.reward ?? 0);
                }
            }
        }

        // Calculate multipliers
        if (questData?.discord_roles) {
            for (const role of questData.discord_roles) {
                if (role in roleMultipliers) {
                    if (role === 'Phase 2' || role === 'Phase 2-Manual') {
                        humanMultiplier = roleMultipliers[role as keyof typeof roleMultipliers];
                    } else {
                        discordMultiplier *= roleMultipliers[role as keyof typeof roleMultipliers];
                    }
                }
            }
        }

        const { data: pointsData, error: pointsError } = await supabasePublicClient
            .from('vr_phase2_counts')
            .select('*')
            .single();

        if (pointsError) throw pointsError;

        const systemPoints = pointsData.total_points_tokens / Math.pow(10, 6);
        const systemVoiPoints = pointsData.total_quest_points;
        const pointsRewardRate = 1000000 / systemPoints; // $POINTS reward rate
        const voiRewardRate = 99000000 / systemVoiPoints; // $VOI reward rate

        // Calculate estimated reward
        const estimatedReward = Math.min(
            ((totalPoints * discordMultiplier * humanMultiplier) * voiRewardRate) + 
            ((Number(questData?.points_tokens) ?? 0 / Math.pow(10, 6)) * pointsRewardRate / Math.pow(10, 6)),
            50000
        );

        return json({ 
            wallet,
            estimatedReward 
        }, {
            headers: corsHeaders
        });

    } catch (error) {
        console.error('Error calculating estimated reward:', error);
        return json({ error: 'An error occurred while calculating the estimated reward' }, { 
            status: 500,
            headers: corsHeaders
        });
    }
}

export function OPTIONS() {
    return new Response(null, {
        headers: corsHeaders
    });
}