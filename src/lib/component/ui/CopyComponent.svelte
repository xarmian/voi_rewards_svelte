<script lang="ts">
    import { copy } from 'svelte-copy';
    import { toast } from '@zerodevx/svelte-toast';

    export let text: string = ''; // text to be copied to the clipboard
    export let toastMessage: string = ''; // message to be displayed when the text is copied to the clipboard
    export let failureMessage: string = ''; // message to be displayed when the text fails to copy to the clipboard
</script>

<span
    class="cursor-pointer"
    use:copy={{
        text,
        events: ['click'],
        onCopy: () => toast.push(toastMessage),
        onError: () => toast.push(failureMessage),
    }}
    on:click|stopPropagation
    role="button"
    tabindex="0"
    on:keydown|stopPropagation={(e) => e.key === 'Enter'}
>
    <slot>
        <i class="fas fa-copy text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"></i>
    </slot>
</span>
