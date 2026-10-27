<script lang="ts">
	import SearchBox from '../SearchBox/SearchBox.svelte';
	import ThemeToggle from '../ThemeToggle/ThemeToggle.svelte';
	import { navItems, type NavKey } from './nav';
	let {
		current,
		onopenchange,
		onsubmit
	}: {
		current: NavKey | null;
		onopenchange: (open: boolean) => void;
		onsubmit: (address: string) => void;
	} = $props();
	let dialog: HTMLDialogElement | undefined = $state();
	export function show() {
		dialog?.showModal();
		onopenchange(dialog?.open ?? false);
	}
	function close() {
		dialog?.close();
	}
	function backdrop(event: MouseEvent) {
		if (event.target !== dialog || !dialog) return;
		const bounds = dialog.getBoundingClientRect();
		if (
			event.clientX < bounds.left ||
			event.clientX > bounds.right ||
			event.clientY < bounds.top ||
			event.clientY > bounds.bottom
		)
			close();
	}
</script>

<!-- TASK-65: backdrop clicks are pointer-only; native dialog supplies Escape. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	id="site-menu"
	aria-label="Site menu"
	bind:this={dialog}
	onclose={() => onopenchange(false)}
	onclick={backdrop}
	class="m-0 ml-auto h-dvh max-h-dvh w-full max-w-sm overflow-y-auto border-l border-line bg-surface p-5 text-ink shadow-pop"
>
	<button
		type="button"
		onclick={close}
		class="mb-4 min-h-11 rounded-ds-sm border border-edge px-4 text-label">Close menu</button
	>
	<nav aria-label="Mobile">
		<ul class="mb-6 space-y-2">
			{#each navItems as item (item.key)}
				<li>
					<a
						href={item.href}
						aria-current={current === item.key ? 'page' : undefined}
						onclick={close}
						class="block rounded-full px-4 py-3 text-body {current === item.key
							? 'bg-canvas text-accent'
							: 'text-ink-muted hover:text-ink'}">{item.label}</a
					>
				</li>
			{/each}
		</ul>
	</nav>
	{#if current !== 'home'}
		<SearchBox
			variant="compact"
			collapsible={false}
			id="ds-search-menu"
			formLabel="Menu wallet search"
			onsubmit={(address) => {
				close();
				onsubmit(address);
			}}
		/>
	{/if}
	<div class="mt-4"><ThemeToggle /></div>
</dialog>

<style>
	dialog {
		touch-action: pan-y;
	}
	/* TASK-65: the surface dialog can be nested inside the gallery's hero band. */
	dialog :global(:focus-visible) {
		outline-color: rgb(var(--c-focus));
	}
</style>
