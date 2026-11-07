import { untrack } from 'svelte';

// Each <img> element carries the generation it was created in (the component stamps it on the element),
// and an event only counts while its generation is the current one. A replaced <img> that is still
// loading keeps its listener, so a late event from it arrives later, naming an old generation, and must
// change nothing. Keying by src instead is not enough: after A, then B, then A again, the first A's late
// event names the same URL as the current A.
export function createAvatarImage(getSrc: () => string | null) {
	const src = $derived(getSrc());
	let generation = $state(0);
	let loaded = $state(false);
	let failed = $state(false);
	let seen = untrack(() => src);

	// A new src, including the same one coming back after another, starts a new generation, hidden.
	$effect.pre(() => {
		const next = src;
		untrack(() => {
			if (next === seen) return;
			seen = next;
			generation++;
			loaded = false;
			failed = false;
		});
	});

	return {
		get src() {
			return src;
		},
		get generation() {
			return generation;
		},
		get show() {
			return src !== null && loaded && !failed;
		},
		onload(forGeneration: number) {
			if (forGeneration === generation) loaded = true;
		},
		onerror(forGeneration: number) {
			if (forGeneration === generation) failed = true;
		}
	};
}
