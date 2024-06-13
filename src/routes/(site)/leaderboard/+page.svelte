<script lang="ts">
	import Leaderboard from "./Leaderboard.svelte";

    import type { PageData } from './$types';
    
    export let data: PageData;
</script>

<!-- back button to return to /quests page -->
<div class="container mx-auto mt-6">
    <a href="/quests" class="text-blue-500 dark:text-blue-300">← Back to Quests</a>
</div>
<div class="container mx-auto my-6">
    <div class="p-8 rounded-2xl bg-white dark:bg-gray-900 shadow-md">
        <h1 class="text-2xl font-semibold text-gray-800 dark:text-white">
            <img src="/logos/voi_logo.png" alt="Voi" class="h-14 pb-2 inline-block" />
            Leaderboard
        </h1>
        <Leaderboard data={data.ranks} />
    </div>
</div>
