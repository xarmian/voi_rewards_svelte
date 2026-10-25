<script lang="ts">
	import { copy } from 'svelte-copy';
	import { toast } from '@zerodevx/svelte-toast';

	export let text: string = ''; // text to be copied to the clipboard
	export let ariaLabel: string = 'Copy to clipboard';
	export let toastMessage: string = ''; // message to be displayed when the text is copied to the clipboard
	export let failureMessage: string = ''; // message to be displayed when the text fails to copy to the clipboard
</script>

<button
	type="button"
	aria-label={ariaLabel}
	class="cursor-pointer bg-transparent border-0 p-0 inline-flex items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 rounded"
	use:copy={{
		text,
		events: ['click'],
		onCopy: () => toast.push(toastMessage),
		onError: () => toast.push(failureMessage)
	}}
	on:click|stopPropagation
>
	<slot>
		<i
			aria-hidden="true"
			class="fas fa-copy text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
		></i>
	</slot>
</button>
