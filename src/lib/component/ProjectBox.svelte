<script lang="ts">
	import type { PLeaderboard } from "$lib/supabase.js";

    export let project;
    export let selectedTab = 0;
    export let leaderboardData: PLeaderboard | undefined = undefined;

</script>
<div 
    class="cursor-pointer border rounded-xl overflow-hidden w-full sm:w-1/3 h-64 flex flex-col justify-between
    font-semibold m-2
     
     border-blue-200 dark:border-blue-700">
    <div class="p-4 h-full bg-gray-100 dark:bg-slate-900 flex flex-col justify-between space-y-4 cursor-pointer">
        <div class="flex flex-col items-center">
            {#if project.logo}
                <img src={project.logo} alt={project.title} class="h-12" />
            {:else}
                <h2 class="text-lg font-bold">{project.title}</h2>
            {/if}
        </div>
        
        <div class="text-sm">
            <p class="font-bold">{project.type}</p>
            <p>{project.quests.length} quest{project.quests.length === 1 ? '' : 's'}</p>
            {#if leaderboardData && project.column && leaderboardData[project.column]}
                <p class="text-green-500">{leaderboardData[project.column]} actions completed 🎉</p>
            {/if}
        </div>
        
        <div>
            {#if (project.status ?? 'inactive') !== 'active'}
                <p class="text-center text-xs py-2 rounded bg-red-200 text-red-700">Coming soon!</p>
            {:else if project.realtime ?? false}
                <p class="text-center text-xs py-2 rounded bg-green-200 dark:bg-green-900 text-green-700 dark:text-green-200">Realtime Data ⚡</p>
            {/if}
        </div>
    </div>
    {#if (project.status ?? 'inactive') === 'active'}
        <button 
            class:disabled={(project.status??'inactive') !== 'active'}
            class="py-2 px-4 bg-blue-500 text-white font-bold hover:bg-blue-700 transition duration-300 ease-in-out dark:bg-blue-700 dark:text-gray-200 dark:hover:bg-blue-900"
            on:click={() => selectedTab = project.id}
            >
            Learn More
        </button>
    {/if}
</div><style>
    .disabled {
        cursor: not-allowed;
        pointer-events: none;
        background-color: gray;
    }
  </style>

