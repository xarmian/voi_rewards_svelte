<script lang="ts">
	import Leaderboard from "./Leaderboard.svelte";

    import type { PageData } from './$types';
	import InfoButton from "$lib/component/ui/InfoButton.svelte";
    
    export let data: PageData;
</script>

<div class="container mx-auto mt-6">
    <a href="/quests" class="text-blue-500 dark:text-blue-300">← Back to Quests</a>
</div>
<div class="flex flex-col sm:flex-row justify-center items-center mt-4">
    <div class="flex flex-col items-center sm:items-start sm:mr-4">
        <div class="p-4 rounded-lg bg-white dark:bg-gray-900 shadow-md h-40 w-40 flex flex-col items-center justify-center">
            <div class="text-2xl font-semibold text-gray-800 dark:text-white">{data.total_accounts}</div>
            <div class="text-gray-500 dark:text-gray-300">Users</div>
        </div>
    </div>
    <div class="flex flex-col items-center sm:items-start sm:mx-4">
        <div class="p-4 rounded-lg bg-white dark:bg-gray-900 shadow-md h-40 w-40 flex flex-col items-center justify-center">
            <div class="text-2xl font-semibold text-gray-800 dark:text-white flex align-middle space-x-2">
                <div>6</div>
                <div class="self-center">
                    <InfoButton noAbsolute={true}>
                        <div class="text-xs">
                            Current Projects Tracked in Leaderboard:
                            <ul class="list-disc list-inside">
                                <li>Node Running</li>
                                <li>Nautilus</li>
                                <li>Nomadex</li>
                                <li>Humble</li>
                                <li>NFTNavigator</li>
                                <li>Mechaswap</li>
                            </ul>
                        </div>
                    </InfoButton>
                </div>
            </div>
            <div class="text-gray-500 dark:text-gray-300">Projects Tracked</div>
        </div>
    </div>
    <div class="flex flex-col items-center sm:items-start sm:ml-4">
        <div class="p-4 rounded-lg bg-white dark:bg-gray-900 shadow-md h-40 w-40 flex flex-col items-center justify-center">
            <div class="text-2xl font-semibold text-gray-800 dark:text-white">{data.total_points}</div>
            <div class="text-gray-500 dark:text-gray-300">Points Earned</div>
        </div>
    </div>
</div>
<div class="container mx-auto my-6">
    <div class="p-2 sm:p-8 rounded-2xl bg-white dark:bg-gray-900 shadow-md">
        <div class="flex flex-col sm:flex-row sm:justify-between">
            <h1 class="text-2xl font-semibold text-gray-800 dark:text-white">
                <img src="/logos/voi_logo.png" alt="Voi" class="h-14 pb-2 inline-block" />
                Project Quest Leaderboard
            </h1>
            <div class="text-xs sm:place-self-end">
                <div>
                    Leaderboard data is delayed and updated periodically throughout the day.
                </div>
                <div>
                    NOTE: Not all projects are tracked in the leaderboard.
                </div>
            </div>
        </div>
        <Leaderboard data={data.ranks} />
    </div>
</div>
