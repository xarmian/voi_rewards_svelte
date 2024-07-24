<script lang="ts">
    import type { IProject, IQuest} from "$lib/data/types";
	import BreadcrumbCustom from "./ui/BreadcrumbCustom.svelte";
	import InfoButton from "./ui/InfoButton.svelte";

    export let quest: IQuest;
    export let project: IProject;
    export let wallet: string | null;
    export let loading: boolean;

</script>
<div class="flex flex-col space-y-6 mt-6">
    <div>
        <div class="bg-white rounded-lg px-3 py-1 font-extrabold">
            <span class="font-medium">Epoch Frequency:</span>
            <span class="">{quest.frequency ?? 'Once'}</span>
        </div>
        {#if quest.frequency && quest.frequency !== 'Once'}
            <div class="text-sm">(Resets at midnight UTC{quest.frequency === 'Weekly' ? ' on Monday mornings' : ''})</div>
        {/if}
    </div>
    
    {#if quest.guide}
        <a class="flex justify-between rounded-lg text-white px-4 py-3 bg-[#6F2AE2] text-xl place-items-center" target="_blank" href={quest.guide}>
            <div>View Guide</div>
            <i class="fas fa-arrow-right"></i>
        </a>
    {/if}

    <div class="pt-2">
        {#if !project.realtime || quest.earned == -1 || !quest.name}
            <div class="text-sm text-red-500 flex items-center space-x-2">
                <i class="fas fa-exclamation-circle"></i>
                <span>Status unavailable</span>
                <InfoButton noAbsolute={true} buttonColor="text-[#0A77FF]">
                    <p class="text-xs">Completion status is not currently available for this quest. Quests or actions listed should still be tracked if done properly, and may be visible on other platforms such as Galxe, on the Project's own page, or not available yet. A link to the project's Galaxe page is available above this quest table.</p>
                </InfoButton>
            </div>
        {:else if !wallet}
            <div class="text-sm text-red-500">Enter Wallet to View Status</div>
        {:else if loading}
            <div class="flex justify-center">
                <i class="fas fa-spinner fa-spin text-blue-500 text-xl"></i>
            </div>
        {:else if quest.complete_epoch === true || ((quest.earned??0) > 0 && quest.complete_epoch === undefined)}
            <div class="flex flex-row space-x-2 text-green-500">
                <i class="fas fa-check text-xl mt-1"></i>
                <div>
                <div>Completed</div>
                </div>
            </div>
        {:else}
            {#if quest.status === 'done'}
                <div class="flex items-start space-x-2 text-gray-500">
                    <i class="fas fa-times text-xl"></i>
                    <span class="flex space-x-2">
                        <span>This Quest has Expired</span>
                        <InfoButton noAbsolute={true} buttonColor="text-[#0A77FF]">
                            <p class="text-sm">This quest has expired and is no longer available to complete. Please check the project's page for more information. Expired quests may be re-instated in the future.</p>
                        </InfoButton>
                    </span>
                </div>
            {:else}
                <div class="flex items-center space-x-2 text-red-500">
                    <i class="fas fa-times text-xl"></i>
                    <span>Incomplete</span>
                    {#if quest.complete_epoch === false}
                        <span class="text-sm">(for current epoch)</span>
                    {/if}
                </div>
            {/if}
        {/if}
        {#if quest.earned && quest.earned > 0}
            <div class="text-sm text-green-800">+{quest.earned} point{(quest.earned??0) > 1 ? 's' : ''}</div>
        {/if}
    </div>
</div>