/**
 * Wraps a Retry callback so keyboard focus moves to a stable region before the retry runs.
 *
 * Retry usually swaps its alert for a loading placeholder in the same update, which unmounts the
 * focused button and drops focus to the document body. Focusing a region that stays mounted (a
 * non-interactive element with tabindex="-1") keeps the user in place. The region is read when Retry
 * is activated, because `bind:this` is only set after the component initialises.
 *
 * Returns undefined when there is no retry, so InlineAlert keeps hiding its button.
 */
export function retryKeepingFocus(
	region: () => HTMLElement | null | undefined,
	onretry: (() => void) | undefined
): (() => void) | undefined {
	if (!onretry) return undefined;
	return () => {
		region()?.focus({ preventScroll: true });
		onretry();
	};
}
