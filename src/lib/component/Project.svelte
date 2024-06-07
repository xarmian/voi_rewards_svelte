<script lang="ts">
    import type { IProject, IQuest} from "$lib/data/types";
    import { supabasePublicClient } from '$lib/supabase';
	import InfoButton from "./ui/InfoButton.svelte";
    import GalaxeIconImage from "$lib/assets/galxe_icon.jpeg";

    export let project: IProject;
    export let wallet: string | null;

    $: localProject = project;
    $: loading = true;

    async function getNodePoints() {
        try {
            const url = `https://api.voirewards.com/proposers/index_p2.php?action=walletPoints&wallet=${wallet}`;
            const data = await fetch(url).then((response) => response.json());

            // data is an object of objects with key: date, { health, points }
            let points = Object.keys(data).map((key) => {
                return { date: key, health: data[key].health, points: data[key].points };
            });
            
            // find the quest with title "Network Infrastructure" and add health points
            let ni = localProject.quests.find((quest) => quest.title === 'Network Infrastructure');
            if (ni) ni.earned = points.reduce((acc, cur) => acc + cur.points, 0);

            // set all other quest earned to -1
            for (let i = 0; i < localProject.quests.length; i++) {
                if (localProject.quests[i].earned === undefined) {
                    localProject.quests[i].earned = -1;
                }
            }

            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    async function getNomadexPoints() {
        try {
            const url = `https://api.nomadex.app/actions.csv?address=${wallet}`;
            const response = await fetch(url);
            const csvData = await response.text();
            const parsedData = parseCSV(csvData);
            
            // filter parsedData for wallet (address)
            const data = parsedData.filter((row) => row.address === wallet);
            
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                const row = data.filter((row) => row.action === quest.name);

                if (row.length > 0) {
                    if (quest.name == 'swap') {
                        let uniqueDates = new Set();
                        row.forEach(entry => {
                            let date = new Date(Number(entry.timestamp) * 1000).toISOString().split('T')[0];
                            uniqueDates.add(date);
                        });
                        quest.earned = uniqueDates.size;
                    }
                    else {
                        quest.earned = 1;
                    }
                }
                else {
                    quest.earned = 0;
                }
            }
            
            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    async function getNFTNavigatorPoints() {
        const { data, error } = await supabasePublicClient
            .from('actions')
            .select('*')
            .eq('address', wallet);

        if (error) {
            console.error('Failed to fetch quests', error);
        }
        else {
            let completedActions = [...new Set(data.map(item => item.action))];

            // for each quest, check if action is in completedActions
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                if (completedActions.includes(quest.name)) {
                    quest.earned = 1;
                }
                else {
                    quest.earned = 0;
                }
            }

            loading = false;
        }
    }

    async function getAlgoLeaguesPoints() {
        try {
            const url = `/api/quests/?project=Algoleagues&wallet=${wallet}`;
            const response = await fetch(url);
            const data = await response.json();

            // for each quest, check if action is in completedActions
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                if (data && data.quests && data.quests[`algo-leagues-${quest.id}`]?.completed) {
                    quest.earned = 1;
                }
                else {
                    quest.earned = 0;
                }
            }

            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    async function getNautilusPoints() {
        try {
            const url = `https://quest.nautilus.sh/quest?key=${wallet}`;
            const data = await fetch(url).then((response) => response.json());

            if (data.message !== 'ok') {
                console.error('Failed to fetch Nautilus points:', data.message);
                return;
            }

            // for each quest, check if action is in completedActions
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                if (data.results.find((result: { key: string, value: string }) => result.key === quest.name+':'+wallet)) {
                    quest.earned = 1;
                }
                else {
                    quest.earned = 0;
                }
            }

            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    async function getMechaswapPoints() {
        try {
            const url = `https://mechaswap-quest.nautilus.sh/quest?key=${wallet}`;
            const data = await fetch(url).then((response) => response.json());

            if (data.message !== 'ok') {
                console.error('Failed to fetch Nautilus points:', data.message);
                return;
            }

            // for each quest, check if action is in completedActions
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                if (data.results.find((result: { key: string, value: string }) => result.key === quest.name+':'+wallet)) {
                    quest.earned = 1;
                }
                else {
                    quest.earned = 0;
                }
            }

            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    async function getHumblePoints() {
        try {
            const url = `https://humble-quest.nautilus.sh/quest?key=${wallet}`;
            const data = await fetch(url).then((response) => response.json());

            if (data.message !== 'ok') {
                console.error('Failed to fetch Nautilus points:', data.message);
                return;
            }

            // for each quest, check if action is in completedActions
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                if (data.results.find((result: { key: string, value: string }) => result.key === quest.name+':'+wallet)) {
                    quest.earned = 1;
                }
                else {
                    quest.earned = 0;
                }

                if (quest.id === 9) quest.earned = -1;
            }

            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    async function getKibisisPoints() {
        try {
            const url = `https://api.kibis.is/quests/daily?account=${wallet}`;
            const data = await fetch(url).then((response) => response.json());

            if (data.account !== wallet) {
                console.error('Failed to fetch Kibisis points:', data);
                return;
            }

            // for each quest, check if action is in completedActions
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                if (data.quests.find((result: { id: string, completed: number }) => result.id === quest.name && result.completed === 1)) {
                    quest.earned = 1;
                }
                else {
                    quest.earned = 0;
                }
            }

            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    $: if (wallet) {
        loading = true;
        switch(project.title) {
            case 'Voi Network':
                getNodePoints();
                break;
            case 'Nomadex':
                getNomadexPoints();
                break;
            case 'NFT Navigator':
                getNFTNavigatorPoints();
                break;
            case 'Kibisis':
                getKibisisPoints();
                break;
            case 'AlgoLeagues':
                getAlgoLeaguesPoints();
                break;
            case 'Nautilus':
                getNautilusPoints();
                break;
            case 'MechaSwap':
                getMechaswapPoints();
                break;
            case 'Humble':
                getHumblePoints();
                break;
            default:
                for (let i = 0; i < project.quests.length; i++) {
                    project.quests[i].earned = -1;
                }
                loading = false;
                break;
        }
    }

    function parseCSV(csvData: string): Array<Record<string, string>> {
        const lines = csvData.split('\n');
        const result: Array<Record<string, string>> = [];
        const headers = lines[0].split(',');

        for (let i = 1; i < lines.length; i++) {
            const obj: Record<string, string> = {};
            const currentline = lines[i].split(',');

            for (let j = 0; j < headers.length; j++) {
                obj[headers[j]] = currentline[j];
            }

            result.push(obj);
        }

        return result;
    }
</script>
<div class="bg-purple-700 dark:bg-purple-800 dark:text-white p-4 rounded-lg shadow-lg mt-4">
    <div class="flex flex-col md:flex-row md:items-center justify-between">
        <div class="mb-4 md:mb-0">
            <h2 class="text-3xl font-bold">
                {#if project.url}
                    <a class="text-blue-300 hover:text-blue-200 underline cursor-pointer" target="_blank" href={project.url}>
                        {project.title}
                    </a>
                {:else}
                    {project.title}
                {/if}
            </h2>
            <p class="text-gray-300 text-sm">{project.description}</p>
            {#if !project.realtime}
                <div class="text-xs text-red-500">Live quest tracking is not yet available for this project.</div>
            {/if}
        </div>
        <div class="flex flex-row space-x-4">
            {#if project.guide}
                <a class="flex items-center space-x-2 text-blue-300 hover:text-blue-200 cursor-pointer" target="_blank" href={project.guide}>
                    <span class="text-lg underline">Project Quest Guide</span>
                </a>
            {/if}
            {#if project.galxe}
                <a class="flex items-center space-x-2 text-blue-300 hover:text-blue-200 cursor-pointer" target="_blank" href={project.galxe}>
                    <span class="text-lg underline">Galxe Guide</span>
                </a>
            {/if}
            {#if project.twitter}
                <a class="flex items-center space-x-2 text-blue-300 hover:text-blue-200 cursor-pointer" target="_blank" href={project.twitter}>
                    <span class="text-lg underline">Project Twitter</span>
                </a>
            {/if}
        </div>
    </div>
</div>
<div class="flex flex-col justify-center">
    <a href={project.url} target="_blank" class="place-self-center h-24 flex flex-col justify-center content-center place-items-centerinline-block bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg mt-4 hover:bg-purple-700">
        <span class="mr-2 self-center">
            <i class="fas fa-external-link-alt"></i>
        </span>
        <div>
            Go to {project.title}
        </div>
    </a>
    <div class="flex flex-wrap justify-around p-4">
        {#each localProject.quests as quest, i}
            <div class="w-full sm:w-1/2 md:w-1/3 bg-white dark:bg-gray-700 rounded-lg overflow-hidden shadow-lg m-4 flex flex-col justify-between">
                <div class="px-6 py-4">
                    <div class="font-bold text-xl mb-2">{quest.title}</div>
                    {#if quest.title !== quest.description}
                        <p class="text-gray-700 dark:text-gray-100 text-base">{quest.description}</p>
                    {/if}
                </div>
                <div class="px-6 pt-4 pb-2 flex flex-col items-center space-y-4">
                    <div>
                        <span class="text-gray-600 dark:text-gray-200 text-sm">Frequency:</span>
                        <span class="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2 mb-2">{quest.frequency ?? 'Once'}</span>
                    </div>
                    {#if quest.guide}
                        <a class="inline-block bg-blue-500 hover:bg-blue-400 text-white py-1 px-2 rounded cursor-pointer" target="_blank" href={quest.guide}>
                            View Guide
                        </a>
                    {/if}
                </div>
                <div class="px-6 pt-4 pb-2 flex flex-row items-center justify-center space-x-4">
                    {#if !project.realtime || quest.earned == -1 || !quest.name}
                        <div class="text-xs text-red-500 flex flex-row">
                            Status unavailable
                            <InfoButton noAbsolute={true}>
                                <p class="text-xs">We are currently unable to track the completion status for this quest. Quests or actions listed should still be tracked if done properly, and may be visible on other platforms such as Galxe, on the Project's own page, or not available yet. A link to the project's Galaxe page is available above this quest table.</p>
                            </InfoButton>
                        </div>
                    {:else if !wallet}
                        <div class="text-xs text-red-500">Enter Wallet to View Status</div>
                    {:else if loading}
                        <i class="fas fa-spinner fa-spin text-blue-500 text-3xl"></i>
                    {:else if quest.earned}
                        <div class="flex items-center space-x-2">
                            <i class="fas fa-check text-green-500 text-3xl"></i>
                            <span>Completed</span>
                        </div>
                        {#if quest.frequency ?? 'Once' != 'Once'}
                            <p class="text-xs text-green-500">+{quest.earned} point{quest.earned > 1 ? 's' : ''}</p>
                        {/if}
                    {:else}
                        <div class="flex items-center space-x-2">
                            <i class="fas fa-times text-red-500 text-3xl"></i>
                            <span>Incomplete</span>
                        </div>
                    {/if}
                </div>
            </div>
        {/each}
    </div>
</div>