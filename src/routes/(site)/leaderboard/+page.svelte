<script lang="ts">
	import Leaderboard from "./Leaderboard.svelte";

    import type { PageData } from './$types';
    
    export let data: PageData;
</script>

<div class="container mx-auto mt-6">
    <a href="/quests" class="text-blue-500 dark:text-blue-300">← Back to Quests</a>
</div>
<div class="flex flex-col sm:flex-row justify-center items-center mt-4">
    <div class="flex flex-col items-center sm:items-start sm:mr-4">
        <div class="p-4 rounded-lg bg-white dark:bg-gray-900 shadow-md h-40 w-40 flex flex-col items-center justify-center">
            <div class="text-2xl font-semibold text-gray-800 dark:text-white">{data.ranks?.length}</div>
            <div class="text-gray-500 dark:text-gray-300">Users</div>
        </div>
    </div>
    <div class="flex flex-col items-center sm:items-start sm:mx-4">
        <div class="p-4 rounded-lg bg-white dark:bg-gray-900 shadow-md h-40 w-40 flex flex-col items-center justify-center">
            <div class="text-2xl font-semibold text-gray-800 dark:text-white">2</div>
            <div class="text-gray-500 dark:text-gray-300">Projects Tracked</div>
        </div>
    </div>
    <div class="flex flex-col items-center sm:items-start sm:ml-4">
        <div class="p-4 rounded-lg bg-white dark:bg-gray-900 shadow-md h-40 w-40 flex flex-col items-center justify-center">
            <div class="text-2xl font-semibold text-gray-800 dark:text-white">{data.ranks?.reduce((acc, row) => acc + row.total, 0)}</div>
            <div class="text-gray-500 dark:text-gray-300">Points Earned</div>
        </div>
    </div>
</div>
<div class="container mx-auto my-6">
    <div class="p-2 sm:p-8 rounded-2xl bg-white dark:bg-gray-900 shadow-md">
        <h1 class="text-2xl font-semibold text-gray-800 dark:text-white">
            <img src="/logos/voi_logo.png" alt="Voi" class="h-14 pb-2 inline-block" />
            Leaderboard
        </h1>
        <Leaderboard data={data.ranks} />
    </div>
</div>
