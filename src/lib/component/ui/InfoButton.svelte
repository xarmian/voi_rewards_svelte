<script lang="ts">
    import { Popover } from "flowbite-svelte";

    export let noAbsolute = false;
    export let buttonColor = "text-blue-200";

    let id = `info-${Math.random().toString(36).substring(2, 11)}`;
</script>
<div class="text-2xl font-bold text-gray-800 dark:text-gray-200 flex flex-col place-items-center {!noAbsolute ? 'm-2 absolute top-0 right-0' : 'ml-1 -mt-1 -mb-1'}">
    <button id={id}>
        <i class="fas fa-info-circle mr-2 {buttonColor}"></i>
    </button>
    <Popover
        triggeredBy="#{id}"
        placement="bottom"
        class="w-64 text-sm p-4 bg-gray-100 dark:bg-gray-800 rounded-lg shadow-lg"
        style="z-index: 1000"
    >
        <slot />
    </Popover>
</div>

