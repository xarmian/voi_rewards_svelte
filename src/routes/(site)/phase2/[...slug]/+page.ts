import { supabasePublicClient, type PLeaderboard, type VrPhase2, type VrQuest } from '$lib/supabase';
import { fetchProjects } from '../../phase2/[...slug]/projects';

export const load = async ({ params }) => {
    const systemPoints = 650988517.55; // $POINTS total supply
    const systemVoiPoints = 4985925.676; // $VOI total supply
    const pointsRewardRate = 1000000 / systemPoints; // $POINTS reward rate
    const voiRewardRate = 99000000 / systemVoiPoints; // $VOI reward rate

    const { slug } = params;
    const parts = slug.split('/');
    const wallet = (parts[0] && parts[0] === '_') ? '' : parts[0] ?? '';

    const projects = await fetchProjects();
    const project = projects.find((p) => p.column === parts[1]) ?? projects.find((p) => p.id === Number(parts[1]));
    const projectId = project?.id ?? 0;

    let leaderboardData: PLeaderboard | undefined;
    let questData: VrPhase2 | undefined;
    let questList: VrQuest[] | [] = [];
    let totalPoints = 0;
    let discordMultiplier = 1;
    let humanMultiplier = 1;
    let estimatedReward = 0;
    
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
    
    if (wallet.length > 0) {
        const { data, error } = await supabasePublicClient
        .from('leaderboard')
        .select('*')
        .eq('wallet', wallet);

        if (!error) {
            leaderboardData = data && data[0];
        }

        const { data: qData, error: questError } = await supabasePublicClient
        .from('vr_phase2')
        .select('*')
        .eq('address', wallet);

        if (!questError) {
            questData = qData[0];
        }

        const { data: qList, error: questListError } = await supabasePublicClient
        .from('vr_quests')
        .select('*')
        .or('status.is.null,status.neq.inactive');

        if (!questListError) {
            questList = qList;
        }

        // estimate total rewards by adding all points together
        if (questData) {
            for (const quest of Object.keys(questData.quest_data ?? {})) {
                if (questData.quest_data[quest]) {
                    totalPoints += questData.quest_data[quest] * (questList.find(q => q.id === Number(quest))?.reward ?? 0);
                }
            }
        }

        if (questData?.discord_roles) {
            for (const role of questData.discord_roles) {
                if (role in roleMultipliers) {
                    if (role == 'Phase 2') {
                        humanMultiplier = roleMultipliers[role];
                    }
                    else {
                        discordMultiplier *= roleMultipliers[role];
                    }
                }
            }
        }

        estimatedReward = Math.min(
            ((totalPoints * discordMultiplier * humanMultiplier) * voiRewardRate) + 
            ((Number(questData?.points_tokens)??0 / Math.pow(10, 6)) * pointsRewardRate / Math.pow(10, 6)), 50000);
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
            questData,
            questList,
            totalPoints,
            discordMultiplier,
            humanMultiplier,
            estimatedReward,
        },
        pageMetaTags,
    };
};