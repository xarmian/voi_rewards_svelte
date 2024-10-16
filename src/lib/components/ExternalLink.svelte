<script lang="ts">
    export let href: string;
    export let text: string;
    export let details: string | undefined = undefined;
    export let hideLinkText: boolean = false;

    let isHovered = false;

    $: useDetails = details || 'External Link: ' + href;
</script>

<div class="relative inline-block">
    <a {href}
       target="_blank"
       rel="noopener noreferrer"
       class="text-blue-500 hover:text-blue-700 hover:underline inline-flex items-center"
       on:mouseenter={() => isHovered = true}
       on:mouseleave={() => isHovered = false}>
        {#if !hideLinkText}
            <span>{text}</span>
        {/if}
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
    </a>
    {#if isHovered}
        <div class="absolute z-10 p-2 bg-gray-800 text-white text-sm rounded shadow-lg mt-1 w-64">
            {useDetails}
        </div>
    {/if}
</div>