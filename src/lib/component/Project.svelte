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

    async function getKibisisPoints() {
        // set all quest.earned to -1
        for (let i = 0; i < project.quests.length; i++) {
            project.quests[i].earned = -1;
        }
        loading = false;
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
<div class="flex flex-col md:flex-row md:justify-between p-2 md:p-0">
    <h2 class="text-2xl font-bold mb-4 mt-4 flex flex-col">
        {#if project.url}
            <a class="text-blue-500 hover:text-blue-400 underline cursor-pointer" target="_blank" href={project.url}>
                {project.title}
            </a>
        {:else}
            {project.title}
        {/if}
        <p class="text-gray-600 dark:text-gray-200 text-sm">{project.description}</p>
        {#if !project.realtime}
            <div class="text-xs text-red-500">Live quest tracking is not yet available for this project.</div>
        {/if}
    </h2>
    <div class="flex flex-row md:self-end md:place-items-end mb-2 space-x-4">
        {#if project.guide}
        <a class="flex items-center space-x-1 text-green-500 hover:text-green-400 cursor-pointer shadow-md rounded-lg bg-gray-100 dark:bg-transparent md:shadow-none md:bg-transparent transform transition duration-500 ease-in-out hover:scale-105" target="_blank" href={project.guide}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
            <span class="text-lg text-blue-500 hover:text-blue-400 underline">Project Quest Guide</span>
        </a>
        {/if}
        {#if project.galxe}
        <a class="flex items-center space-x-1 text-green-500 hover:text-green-400 cursor-pointer shadow-md rounded-lg bg-gray-100 dark:bg-transparent md:shadow-none md:bg-transparent transform transition duration-500 ease-in-out hover:scale-105" target="_blank" href={project.galxe}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                </svg>
                <span class="text-lg text-blue-500 hover:text-blue-400 underline">Galxe Guide</span>
            </a>
        {/if}
        {#if project.twitter}
        <a class="flex items-center space-x-1 text-green-500 hover:text-green-400 cursor-pointer shadow-md rounded-lg bg-gray-100 dark:bg-transparent md:shadow-none md:bg-transparent transform transition duration-500 ease-in-out hover:scale-105" target="_blank" href={project.twitter}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                </svg>
                <span class="text-lg text-blue-500 hover:text-blue-400 underline">Project Twitter</span>
            </a>
        {/if}
    </div>
</div>
<div class="md:hidden">
    {#each localProject.quests as quest, i}
        <div class="border-b border-gray-300 dark:border-gray-900">
            <button class="flex flex-row w-full text-left p-4 justify-between bg-gray-100 dark:bg-gray-700" on:click={() => quest.isOpen = !quest.isOpen}>
                <div>
                    <div class="font-semibold">{quest.title}</div>
                    <div class="text-xs">{quest.description}</div>
                </div>
                <div>
                    {#if quest.isOpen}
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    {:else}
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    {/if}
                </div>
            </button>
            {#if quest.isOpen}
                <div class="p-4 bg-white dark:bg-gray-800">
                    <div><strong>Guide:</strong> 
                        {#if !quest.guide}
                            N/A
                        {:else}
                            <a class="text-blue-500 hover:text-blue-400 cursor-pointer" target="_blank" href={quest.guide}>
                                View Guide
                            </a>
                        {/if}
                    </div>
                    <div><strong>Frequency:</strong> {quest.frequency ?? 'Once'}</div>
                    <div><strong>Completed?</strong> 
                        {#if !project.realtime || quest.earned == -1}
                            <div class="text-xs text-red-500 flex flex-row">
                                Real-time tracking unavailable
                                <InfoButton noAbsolute={true}>
                                    <p class="text-xs">We are currently unable to track the completion status for this quest. Quests or actions listed should still be tracked if done properly, and may be visible on other platforms such as Galxe, on the Project's own page, or not available yet. A link to the project's Galaxe page is available above this quest table.</p>
                                </InfoButton>
                            </div>
                        {:else if !wallet}
                            <div class="text-xs text-red-500">Enter Wallet to View Status</div>
                        {:else if loading}
                            <i class="fas fa-spinner fa-spin text-blue-500 text-3xl"></i>
                        {:else if quest.earned}
                            <i class="fas fa-check text-green-500 text-3xl"></i>
                            {#if quest.frequency ?? 'Once' != 'Once'}
                                <p class="text-xs text-green-500">+{quest.earned} point{quest.earned > 1 ? 's' : ''}</p>
                            {/if}
                        {:else}
                            <i class="fas fa-times text-red-500 text-3xl"></i>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    {/each}
</div>
<div class="hidden md:block">
    <table class="w-full whitespace-no-wrap">
        <thead>
            <tr class="text-xs font-semibold tracking-wide text-left text-gray-500 dark:text-gray-100 uppercase border-b bg-gray-50 dark:bg-gray-700">
                <th class="px-4 py-3 align-top">Quest</th>
                <th class="px-4 py-3 align-top">Description</th>
                <th class="px-4 py-3 align-top">Guide</th>
                <th class="px-4 py-3 align-top">Frequency</th>
                <th class="px-4 py-3 align-top">Completed?</th>
            </tr>
        </thead>
        <tbody class="bg-white dark:bg-gray-700 divide-y text-left">
            {#each localProject.quests as quest, i}
                <tr class="text-gray-700 dark:text-gray-100">
                    <td class="px-4 py-3">#{quest.id}</td>
                    <td class="px-4 py-3">
                        <div class="font-semibold">{quest.title}</div>
                        <div class="text-xs">{quest.description}</div>
                    </td>
                    <td class="px-4 py-3">
                        {#if !quest.guide}
                            N/A
                        {:else}
                            <a class="text-blue-500 hover:text-blue-400 cursor-pointer" target="_blank" href={quest.guide}>
                                View Guide
                            </a>
                        {/if}
                    </td>
                    <td class="px-4 py-3">{quest.frequency ?? 'Once'}</td>
                    <td class="px-4 py-3">
                        {#if !project.realtime || quest.earned == -1}
                            <div class="text-xs text-red-500 flex flex-row">
                                Real-time tracking unavailable
                                <InfoButton noAbsolute={true}>
                                    <p class="text-xs">We are currently unable to track the completion status for this quest. Quests or actions listed should still be tracked if done properly, and may be visible on other platforms such as Galxe, on the Project's own page, or not available yet. A link to the project's Galaxe page is available above this quest table.</p>
                                </InfoButton>
                            </div>
                        {:else if !wallet}
                            <div class="text-xs text-red-500">Enter Wallet to View Status</div>
                        {:else if loading}
                            <i class="fas fa-spinner fa-spin text-blue-500 text-3xl"></i>
                        {:else if quest.earned}
                            <i class="fas fa-check text-green-500 text-3xl"></i>
                            {#if quest.frequency ?? 'Once' != 'Once'}
                                <p class="text-xs text-green-500">+{quest.earned} point{quest.earned > 1 ? 's' : ''}</p>
                            {/if}
                        {:else}
                            <i class="fas fa-times text-red-500 text-3xl"></i>
                        {/if}
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>
<br/>
