import { json } from '@sveltejs/kit';
import { supabasePublicClient, type VrPhase2, type VrQuest } from '$lib/supabase';

const systemPoints = 650988517.55; // $POINTS total supply
const systemVoiPoints = 4985925.676; // $VOI total supply
const pointsRewardRate = 1000000 / systemPoints; // $POINTS reward rate
const voiRewardRate = 99000000 / systemVoiPoints; // $VOI reward rate

const roleMultipliers = {
    'Phase 2': 2.5,
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

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
    const wallet = url.searchParams.get('wallet');

    if (!wallet) {
        return json({ error: 'Missing required parameter: wallet' }, { status: 400 });
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
                    if (role === 'Phase 2') {
                        humanMultiplier = roleMultipliers[role];
                    } else {
                        discordMultiplier *= roleMultipliers[role];
                    }
                }
            }
        }
console.log(totalPoints, discordMultiplier, humanMultiplier);
        // Calculate estimated reward
        const estimatedReward = Math.min(
            ((totalPoints * discordMultiplier * humanMultiplier) * voiRewardRate) + 
            ((Number(questData?.points_tokens) ?? 0 / Math.pow(10, 6)) * pointsRewardRate / Math.pow(10, 6)),
            50000
        );

        return json({ 
            wallet,
            estimatedReward 
        });

    } catch (error) {
        console.error('Error calculating estimated reward:', error);
        return json({ error: 'An error occurred while calculating the estimated reward' }, { status: 500 });
    }
}