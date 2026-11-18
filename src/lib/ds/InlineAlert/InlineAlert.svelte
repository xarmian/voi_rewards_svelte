<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '../Button/Button.svelte';
	import { glyphs, toneClasses } from '../types';
	let {
		message,
		tone = 'danger',
		onretry,
		retryLabel = 'Retry'
	}: {
		message: string;
		tone?: 'danger' | 'warn';
		onretry?: () => void;
		retryLabel?: string;
	} = $props();

	let root: HTMLDivElement;

	// A retry can clear the alert later, when the new result arrives, which unmounts the focused
	// Retry button and drops focus to the document body. The nearest tabindex="-1" ancestor is a
	// stable region to return focus to. It is captured on mount because the alert is already
	// detached by the time its teardown runs.
	onMount(() => {
		const region = root.parentElement?.closest<HTMLElement>('[tabindex="-1"]') ?? null;
		let focused = root.contains(document.activeElement);
		const onfocusin = () => {
			focused = true;
		};
		// Moving focus between children fires focusout before the next focusin, so the check waits.
		const onfocusout = () => {
			queueMicrotask(() => {
				if (!root.contains(document.activeElement)) focused = false;
			});
		};
		root.addEventListener('focusin', onfocusin);
		root.addEventListener('focusout', onfocusout);
		return () => {
			root.removeEventListener('focusin', onfocusin);
			root.removeEventListener('focusout', onfocusout);
			// Removing a focused element may not fire focusout, so the flag can still be set here.
			if (!focused || !region) return;
			queueMicrotask(() => {
				const active = document.activeElement;
				// Leave focus alone when something else already placed it.
				if ((active === null || active === document.body) && region.isConnected) {
					region.focus({ preventScroll: true });
				}
			});
		};
	});
</script>

<div
	bind:this={root}
	role="alert"
	class="flex flex-wrap items-center gap-2 rounded-ds-sm p-3 text-sm {toneClasses[tone]}"
>
	<span aria-hidden="true">{glyphs[tone].pill}</span><span>{message}</span>
	{#if onretry}<Button variant="soft" size="sm" onclick={onretry}>{retryLabel}</Button>{/if}
</div>
