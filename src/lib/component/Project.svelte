<script lang="ts">
    import type { IProject, IQuest} from "$lib/data/types";
    import { supabasePublicClient } from '$lib/supabase';
	import InfoButton from "./ui/InfoButton.svelte";

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
            
            // sum points[].points
            localProject.quests[0].earned = points.reduce((acc, cur) => acc + cur.points, 0);
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
                const row = data.find((row) => row.action === quest.name);
                if (row) {
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

    async function getKibisisPoints() {
        // set all quest.earned to -1
        for (let i = 0; i < project.quests.length; i++) {
            project.quests[i].earned = -1;
        }
        loading = false;
    }

    $: if (wallet) {
        loading = true;
        project.tracking = true;
        switch(project.title) {
            case 'Node Running':
                getNodePoints();
                break;
            case 'Nomadex':
                getNomadexPoints();
                break;
            case 'NFTNavigator':
                getNFTNavigatorPoints();
                break;
            case 'Kibisis':
                getKibisisPoints();
                project.tracking = false;
                break;
            default:
                for (let i = 0; i < project.quests.length; i++) {
                    project.quests[i].earned = -1;
                }
                loading = false;
                project.tracking = false;
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
<h2 class="text-2xl font-bold mb-4">
    {project.title}
    <p class="text-gray-600 dark:text-gray-200 text-sm">{project.description}</p>
    {#if !project.tracking}
        <div class="text-xs text-red-500">Live quest tracking is not yet available for this project.</div>
    {/if}
</h2>
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
                <td class="px-4 py-3">{quest.description}</td>
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
                    {#if !wallet}
                        <div class="text-xs text-red-500">Enter Wallet to View Status</div>
                    {:else if loading}
                        <i class="fas fa-spinner fa-spin text-blue-500 text-3xl"></i>
                    {:else if quest.earned}
                        {#if quest.earned == -1}
                            <div class="text-xs text-red-500 flex flex-row">
                                Unknown
                                <InfoButton noAbsolute={true}>
                                    <p class="text-sm">This quest is either unavailable, or we are unable to retrieve the completion status.</p>
                                </InfoButton>
                            </div>
                        {:else}
                            <i class="fas fa-check text-green-500 text-3xl"></i>
                            {#if quest.frequency ?? 'Once' != 'Once'}
                                <p class="text-xs text-green-500">+{quest.earned} point{quest.earned > 1 ? 's' : ''}</p>
                            {/if}
                        {/if}
                    {:else}
                        <i class="fas fa-times text-red-500 text-3xl"></i>
                    {/if}
                </td>
            </tr>
        {/each}
    </tbody>
</table>
<br/>
