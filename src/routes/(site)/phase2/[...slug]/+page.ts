import { supabasePublicClient, type PLeaderboard, type VrPhase2, type VrQuest } from '$lib/supabase';
import { fetchProjects } from '../../phase2/[...slug]/projects';

export const load = async ({ params }) => {
    const systemPoints = 650988517.55; // $POINTS total supply
    const systemVoiPoints = 4985925.676; // $VOI total supply
    const pointsRewardRate = 1000000 / systemPoints; // $POINTS reward rate
    const voiRewardRate = 99000000 / systemVoiPoints; // $VOI reward rate

    console.log('pointsRewardRate', pointsRewardRate);
    console.log('voiRewardRate', voiRewardRate);

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

    const pointsBlacklist = [
        'OGAQWRU6U2AXCBNI3EAFAKS2UGFZXU23NFTL3CLWD526W4CF7B5ZA5RTAA',
        'FJ5VLTO3SM4UU6ZGQSNH2Y2KET5HCV6EYAFVCOMJSH7JUOYN4C65XKADFY',
        '5YSWBQPVJMUAKYZ5U4V3Z2WLUJDIFZ4RLOP2N37DZ4V66JWF3WWDZZRCNY',
        'H6HCKZAXA4AISIC5QWNGKKAWURK2LAMK77WNRSKSX64FGM5KQZIHOCTNSA',
        'G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ',
        'TRE3TQ6L7LV5PSSO42AK2BUSQA7XLG4TUXQR7TUNFK5DNGN733LXTT4JMM',
        'DYX2V5XF4IKOHE55Z63XAHVBJTMYM723HK5WJZ72BDZ5AFEFKJ5YP4DOQQ',
        'BWHDXT6H4EP54IE3ETYXR3YATEXNI7ABWYTX3LQVBGTFQZ3OK4QAQWFLLM',
        '2LA6B6WD3TCVLP7CKG2FK6FOHMJPYAXFJB2RZKXNJZSIAYREZWSRJT376M',
        'C46D7INVWU4U2CPOE5NVZT6ZB5NWOLU57U6BDTRFGEDWRKHTT7SPG3JTCA',
        'C5NZ5SNL5EMOEVKFW3DS3DBG3FNMIYJAJY3U4I5SRCOXHGY33ML3TGHD24',
        '2RMPWZ6VDF5FKNIWLQQRJFMIXRCOML5NWB2XBLIUOVPQCW56F7VTUQCMAU',
        'GLG2ZIDZFIFYFNL73AIRZXAPLN3XH4ILXJX5XGXXQNA5JGDWTO6VZZSLPM',
        'DORKBJ6VCEB4FRZ5GC7JWFBN3HEKZRIUX3NKN2YMGEEXOLI7TNUOK3GZBY',
        'FEOBLGMDYO254OR3THUBF5S5JHVKMID4NQZSMI5PPCX6K3C3UX3AURZ3WM',
        'CREPE2LPXG7ATFOBJC4RADFEDOQI4N6BWA5YPFE5JKWMHG7PVYNEQETHGU',
        'FODFE2T6P6IGQQ7SG3AIVN3OCZWYCGHKCWWGC45KB3IKM266OZXYGYHDMA',
        'BSVFQL2I7YZWVRQ5THOPTXZXPUYOMYPXUGJUQLVZGQEEPJ27EUZCPEANDI',
    ];
    
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

        //totalPoints += questData.points_tokens / Math.pow(10, 6) * 0.001;

        //if (questData?.discord_linked) totalPoints *= 2;
        //if (questData?.discord_linked && questData?.discord_roles && questData.discord_roles.indexOf('Phase 2') > -1) totalPoints *= 2.4;

        if (questData?.discord_roles) {
            for (const role of questData.discord_roles) {
                if (Object.keys(roleMultipliers).includes(role)) {
                    if (role == 'Phase 2') {
                        humanMultiplier = roleMultipliers[role];
                    }
                    else {
                        discordMultiplier *= roleMultipliers[role];
                    }
                }
            }
        }

        estimatedReward = Math.min(((totalPoints * discordMultiplier * humanMultiplier) * voiRewardRate) + ((Number(questData?.points_tokens)??0 / Math.pow(10, 6)) * pointsRewardRate / Math.pow(10, 6)), 50000);
        console.log('estimatedReward', estimatedReward);
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