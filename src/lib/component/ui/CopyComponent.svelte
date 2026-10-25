<script lang="ts">
	import { copy } from 'svelte-copy';
	import { toast } from '@zerodevx/svelte-toast';

	export let text: string = ''; // text to be copied to the clipboard
	export let ariaLabel: string = 'Copy to clipboard';
	export let toastMessage: string = ''; // message to be displayed when the text is copied to the clipboard
	export let failureMessage: string = ''; // message to be displayed when the text fails to copy to the clipboard
	// 'button': a native button (default). 'span': for use inside another <button>, where a nested
	// <button> is invalid HTML; a focusable role=button span with Enter/Space. 'wrapper': the slotted
	// content is itself the control (e.g. a Flowbite Button), so the wrapper only listens (TASK-23).
	export let mode: 'button' | 'span' | 'wrapper' = 'button';

	function onKeydown(e: KeyboardEvent) {
		if (mode !== 'span' || (e.key !== 'Enter' && e.key !== ' ')) return;
		e.preventDefault();
		e.stopPropagation();
		(e.currentTarget as HTMLElement).click();
	}
</script>

<svelte:element
	this={mode === 'button' ? 'button' : 'span'}
	type={mode === 'button' ? 'button' : undefined}
	role={mode === 'span' ? 'button' : undefined}
	tabindex={mode === 'span' ? 0 : undefined}
	aria-label={mode === 'wrapper' ? undefined : ariaLabel}
	class="cursor-pointer bg-transparent border-0 p-0 inline-flex items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 rounded"
	use:copy={{
		text,
		events: ['click'],
		onCopy: () => toast.push(toastMessage),
		onError: () => toast.push(failureMessage)
	}}
	on:click|stopPropagation
	on:keydown={onKeydown}
>
	<slot>
		<i
			aria-hidden="true"
			class="fas fa-copy text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
		></i>
	</slot>
</svelte:element>
