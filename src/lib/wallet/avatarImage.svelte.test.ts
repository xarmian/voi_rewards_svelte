import { afterEach, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { createAvatarImage } from './avatarImage.svelte';

let dispose: (() => void) | undefined;
afterEach(() => {
	dispose?.();
	dispose = undefined;
	flushSync();
});
function setup(getSrc: () => string | null) {
	let image!: ReturnType<typeof createAvatarImage>;
	dispose = $effect.root(() => {
		image = createAvatarImage(getSrc);
	});
	flushSync();
	return image;
}
const a = 'https://host.example/a.png';
const b = 'https://host.example/b.png';

// Each <img> element carries the generation it was created in; an event only counts for the element
// that is still current. A replaced element that is still loading keeps its listener, so a late event
// from it names an old generation.
it('hides the image before load, shows it after the current image loads, hides it after an error', () => {
	const image = setup(() => a);
	expect(image.src).toBe(a);
	expect(image.show).toBe(false);
	image.onload(image.generation);
	expect(image.show).toBe(true);
	image.onerror(image.generation);
	expect(image.show).toBe(false);
	image.onload(image.generation);
	expect(image.show).toBe(false);
});

it('ignores a late load or error from a replaced image, before or after the new one has loaded', () => {
	let src = $state<string | null>(a);
	const image = setup(() => src);
	const first = image.generation;
	image.onload(first);
	expect(image.show).toBe(true);
	src = b;
	flushSync();
	const second = image.generation;
	expect(second).not.toBe(first);
	expect(image.src).toBe(b);
	expect(image.show).toBe(false);
	image.onload(first); // A finishes late, before B has loaded
	expect(image.show).toBe(false);
	image.onload(second);
	expect(image.show).toBe(true);
	image.onload(first); // A finishes late again, after B has loaded
	expect(image.show).toBe(true);
	image.onerror(first);
	expect(image.show).toBe(true);
});

it('keeps a loaded image visible when an earlier image of the same URL fails late (A, then B, then A)', () => {
	let src = $state<string | null>(a);
	const image = setup(() => src);
	const firstA = image.generation;
	src = b;
	flushSync();
	src = a;
	flushSync();
	const secondA = image.generation;
	expect(new Set([firstA, secondA, image.generation]).size).toBeGreaterThan(1);
	expect(secondA).not.toBe(firstA);
	image.onload(secondA);
	expect(image.show).toBe(true);
	image.onerror(firstA);
	expect(image.show).toBe(true);
});

it('starts hidden again when the same src comes back after another one', () => {
	let src = $state<string | null>(a);
	const image = setup(() => src);
	image.onload(image.generation);
	expect(image.show).toBe(true);
	src = null;
	flushSync();
	expect(image.src).toBeNull();
	expect(image.show).toBe(false);
	src = a;
	flushSync();
	expect(image.show).toBe(false);
});

it('does not start a new generation when the src has not changed', () => {
	const image = setup(() => a);
	const generation = image.generation;
	flushSync();
	expect(image.generation).toBe(generation);
});

it('shows the next image after the previous one failed', () => {
	let src = $state<string | null>(a);
	const image = setup(() => src);
	image.onerror(image.generation);
	expect(image.show).toBe(false);
	src = b;
	flushSync();
	expect(image.show).toBe(false);
	image.onload(image.generation);
	expect(image.show).toBe(true);
});

it('starts a new generation, hidden, when an earlier URL comes back (A, B, A)', () => {
	let src = $state<string | null>(a);
	const image = setup(() => src);
	const firstA = image.generation;
	image.onload(firstA);
	src = b;
	flushSync();
	const onlyB = image.generation;
	image.onload(onlyB);
	expect(image.show).toBe(true);
	src = a;
	flushSync();
	expect(image.generation).not.toBe(onlyB);
	expect(image.generation).not.toBe(firstA);
	expect(image.show).toBe(false);
});

it('ignores an event with no usable generation', () => {
	const image = setup(() => a);
	image.onload(Number.NaN);
	image.onerror(Number.NaN);
	expect(image.show).toBe(false);
	image.onload(image.generation);
	expect(image.show).toBe(true);
});
