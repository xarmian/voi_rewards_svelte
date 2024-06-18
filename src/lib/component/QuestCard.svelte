<script lang="ts">
    import type { IProject, IQuest} from "$lib/data/types";
	import InfoButton from "./ui/InfoButton.svelte";

    export let quest: IQuest;
    export let project: IProject;
    export let wallet: string | null;
    export let loading: boolean;

</script>
<div class="bg-opacity-50 bg-white">
    <div class="p-5">
    {#if quest.guide}
            <a class="text-blue-600 hover:text-blue-500 hover:underline text-sm mb-4 block" target="_blank" href={quest.guide}>
                View Guide &rarr;
            </a>
        {/if}
        
        <div class="text-sm text-gray-800 mb-2">
            <span class="font-medium">Frequency:</span>
            <span class="bg-gray-100 text-gray-800 rounded-full px-3 py-1 font-semibold mr-2">{quest.frequency ?? 'Once'}</span>
            {#if quest.frequency && quest.frequency !== 'Once'}
                <div class="text-gray-600">(Resets at midnight UTC{quest.frequency === 'Weekly' ? ' on Monday mornings' : ''})</div>
            {/if}
        </div>
        
        <div class="pt-2">
            {#if !project.realtime || quest.earned == -1 || !quest.name}
                <div class="text-xs text-red-500 flex items-center space-x-2">
                    <i class="fas fa-exclamation-circle"></i>
                    <span>Status unavailable</span>
                    <InfoButton noAbsolute={true}>
                        <p class="text-xs">Completion status is not currently available for this quest. Quests or actions listed should still be tracked if done properly, and may be visible on other platforms such as Galxe, on the Project's own page, or not available yet. A link to the project's Galaxe page is available above this quest table.</p>
                    </InfoButton>
                </div>
            {:else if !wallet}
                <div class="text-xs text-red-500">Enter Wallet to View Status</div>
            {:else if loading}
                <div class="flex justify-center">
                    <i class="fas fa-spinner fa-spin text-blue-500 text-xl"></i>
                </div>
            {:else if quest.earned}
                <div class="flex flex-row space-x-2 text-green-500">
                    <i class="fas fa-check text-xl mt-1"></i>
                    <div>
                    <div>Completed</div>
                    {#if quest.frequency ?? 'Once' != 'Once'}
                        <div class="text-xs text-green-800">+{quest.earned} point{quest.earned > 1 ? 's' : ''}</div>
                    {/if}
                    </div>
                </div>
            {:else}
                <div class="flex items-center space-x-2 text-red-500">
                    <i class="fas fa-times text-xl"></i>
                    <span>Incomplete</span>
                </div>
            {/if}
        </div>
    </div>
</div>