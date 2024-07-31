<script lang="ts">
	import Leaderboard from "./Leaderboard.svelte";
    import { supabasePublicClient } from "$lib/supabase";
    import type { PLeaderboard } from "$lib/supabase"

    import type { PageData } from './$types';
	import InfoButton from "$lib/component/ui/InfoButton.svelte";
	import Time from "svelte-time/Time.svelte";
    
    export let data: PageData;
    let searchTerm = '';
    let ranks: PLeaderboard[] | undefined = data.ranks;
    let filterRanks: PLeaderboard[] | undefined = ranks;

    $: {
        if (searchTerm.length > 0) {
            supabasePublicClient
                .from('leaderboard')
                .select('*')
                .ilike('wallet', `%${searchTerm}%`)
                .order('row_number', { ascending: true }).limit(100)
                .then(({ data, error }) => {
                    if (error) {
                        console.error(error);
                    } else {
                        filterRanks = data;
                    }
                });
        } else {
            filterRanks = ranks?.slice(0, 100);
        }
    }

</script>
<div class="bg-[rgb(111,42,226)] dark:bg-[#2C037A]">
    <div class="container mx-auto pt-6 text-lg">
        <a href="/quests" class="text-blue-200">← Back to Quests</a>
    </div>
    <div class="flex flex-col sm:flex-row justify-center items-center mt-4">
        <div class="flex flex-col items-center sm:items-start sm:mr-4">
            <div class="p-4 rounded-lg bg-white dark:bg-gray-900 shadow-md h-48 w-48 flex flex-col items-center justify-center">
                <div class="text-2xl font-semibold text-gray-800 dark:text-white">{data.total_accounts}</div>
                <div class="text-gray-500 dark:text-gray-300">Users</div>
            </div>
        </div>
        <div class="flex flex-col items-center sm:items-start sm:mx-4">
            <div class="p-4 rounded-lg bg-white dark:bg-gray-900 shadow-md h-48 w-48 flex flex-col items-center justify-center">
                <div class="text-2xl font-semibold text-gray-800 dark:text-white flex align-middle space-x-2">
                    <div>9</div>
                    <div class="align-center">
                        <InfoButton noAbsolute={true}>
                            <div class="text-xs">
                                Current Projects Tracked in Leaderboard:
                                <ul class="list-disc list-inside">
                                    <li>Node Running</li>
                                    <li>Kibisis</li>
                                    <li>Nautilus</li>
                                    <li>Nomadex</li>
                                    <li>Humble</li>
                                    <li>NFTNavigator</li>
                                    <li>Mechaswap</li>
                                    <li>Algoleagues</li>
                                    <li>Chubs v2</li>
                                </ul>
                            </div>
                        </InfoButton>
                    </div>
                </div>
                <div class="text-gray-500 dark:text-gray-300">Projects Tracked</div>
            </div>
        </div>
        <div class="flex flex-col items-center sm:items-start sm:ml-4">
            <div class="p-4 rounded-lg bg-white dark:bg-gray-900 shadow-md h-48 w-48 flex flex-col items-center justify-center">
                <div class="text-2xl font-semibold text-gray-800 dark:text-white">{data.total_points}</div>
                <div class="text-gray-500 dark:text-gray-300">Actions Completed</div>
            </div>
        </div>
    </div>
    <div class="container mx-auto my-6">
        <div class="p-2 sm:p-8 rounded-2xl bg-white dark:bg-gray-900 shadow-md">
            <div class="flex flex-col sm:flex-row sm:justify-between">
                <div class="w-full">
                    <h1 class="text-2xl font-semibold text-gray-800 dark:text-white">
                        <img src="/logos/voi_logo.png" alt="Voi" class="h-14 pb-2 inline-block" />
                        Project Quest Leaderboard
                    </h1>
                    <div class="text-gray-500 dark:text-gray-300">
                        Points are awarded for participating in Voi Network projects. The leaderboard is currently updated daily at 04:30 UTC.
                    </div>
                    <div class="text-red-800 dark:text-red-500 font-bold text-lg">
                        NOTICE: Not all projects are tracked in the leaderboard. More will be added as the data becomes available.
                    </div>
                    <div class="mt-4 mb-1 flex justify-between w-full">
                        <input
                            type="text" size="40"
                            placeholder="Search by account address..."
                            class="p-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            bind:value={searchTerm}
                        />
                        {#if ranks}
                            <div class="place-self-end">
                                Last updated: <Time timestamp={ranks[0].last_modified} format="MMM D, YYYY h:mm A" />
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
            <Leaderboard data={filterRanks} />
        </div>
    </div>
</div>