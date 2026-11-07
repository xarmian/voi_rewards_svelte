import { untrack } from 'svelte';

// State is keyed by the src an image was asked to load. Every event names the src of the element that
// fired it (the element's own attribute), so a late load or error from an image that has since been
// replaced changes nothing for the current one. That matters because a replaced <img> that is still
// loading keeps its listener, and a handler written as `image.onload` is re-read on every event.
export function createAvatarImage(getSrc: () => string | null) {
	const src = $derived(getSrc());
	let loadedSrc = $state<string | null>(null);
	let failedSrc = $state<string | null>(null);

	// A new src, including the same one coming back, starts hidden again.
	$effect.pre(() => {
		void src;
		untrack(() => {
			loadedSrc = null;
			failedSrc = null;
		});
	});

	return {
		get src() {
			return src;
		},
		get show() {
			return src !== null && loadedSrc === src && failedSrc !== src;
		},
		onload(forSrc: string | null) {
			if (forSrc !== null) loadedSrc = forSrc;
		},
		onerror(forSrc: string | null) {
			if (forSrc !== null) failedSrc = forSrc;
		}
	};
}
