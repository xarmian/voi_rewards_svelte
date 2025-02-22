<script lang="ts">
	export let showModal: boolean;
	export let size: 'sm' | 'md' | 'lg' | 'xl' = 'md';

	let dialog: HTMLDialogElement;
	let isClosing = false;

	$: if (dialog && showModal) {
		isClosing = false;
		dialog.showModal();
	}

	function closeModal() {
		isClosing = true;
		setTimeout(() => {
			dialog.close();
			isClosing = false;
		}, 200);
	}

	const sizeClasses = {
		sm: 'max-w-md',
		md: 'max-w-lg',
		lg: 'max-w-2xl',
		xl: 'max-w-4xl'
	};
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<dialog
	bind:this={dialog}
	on:close={() => (showModal = false)}
	on:click|self={closeModal}
	class="bg-white dark:bg-gray-800 rounded-lg shadow-xl border-0 p-0 {sizeClasses[size]} w-full mx-auto overflow-hidden"
>
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div 
		on:click|stopPropagation 
		class="relative flex flex-col max-h-[90vh] {isClosing ? 'animate-modal-out' : 'animate-modal-in'}"
	>
		{#if $$slots.header}
			<div class="flex-none px-6 py-4 border-b border-gray-200 dark:border-gray-700">
				<slot name="header" />
			</div>
		{/if}

		<div class="flex-1 px-6 py-4 overflow-y-auto">
			<slot />
		</div>

		{#if $$slots.footer}
			<div class="flex-none px-6 py-4 border-t border-gray-200 dark:border-gray-700">
				<slot name="footer" />
			</div>
		{/if}
	</div>
</dialog>

<style>
	dialog {
		margin: 5vh auto;
	}

	dialog::backdrop {
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(2px);
		transition: opacity 0.2s ease-in-out;
	}

	dialog[open]::backdrop {
		opacity: 1;
	}

	dialog:not([open])::backdrop {
		opacity: 0;
	}

	:global(.animate-modal-in) {
		animation: modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	:global(.animate-modal-out) {
		animation: modal-out 0.2s cubic-bezier(0.34, 0.0, 0.64, 1);
	}

	@keyframes modal-in {
		from {
			opacity: 0;
			transform: scale(0.95) translateY(-10px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	@keyframes modal-out {
		from {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
		to {
			opacity: 0;
			transform: scale(0.95) translateY(10px);
		}
	}
</style>
