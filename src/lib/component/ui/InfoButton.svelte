<script lang="ts">
    import { Popover } from "flowbite-svelte";

    export let noAbsolute = false;
    export let buttonColor = "dark:text-blue-200 text-blue-600";
    export let showIcon = true;
    export let customTrigger = false;

    let id = `info-${Math.random().toString(36).substring(2, 11)}`;
</script>

<div class="{!noAbsolute ? 'absolute top-0 right-0 m-2' : 'inline-flex items-center ml-1'} z-10">
    {#if customTrigger}
        <div {id}>
            <slot name="trigger" />
        </div>
    {:else}
        <button {id} class="text-lg" aria-label="Additional information">
            {#if showIcon}
                <i class="fas fa-info-circle {buttonColor} hover:opacity-80 transition-opacity"></i>
            {/if}
        </button>
    {/if}
    <Popover
        triggeredBy="#{id}"
        class="w-64 text-sm font-normal p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
        placement="bottom"
    >
        <slot />
    </Popover>
</div>

