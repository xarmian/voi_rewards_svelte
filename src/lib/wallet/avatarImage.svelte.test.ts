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

it('hides the image before load, shows it after the current image loads, hides it after an error', () => {
	const image = setup(() => 'https://host/a.png');
	expect(image.src).toBe('https://host/a.png');
	expect(image.show).toBe(false);
	image.onload('https://host/a.png');
	expect(image.show).toBe(true);
	image.onerror('https://host/a.png');
	expect(image.show).toBe(false);
	image.onload('https://host/a.png');
	expect(image.show).toBe(false);
});

it('ignores a late load or error from a replaced image, which names its own src', () => {
	let src = $state<string | null>('https://host/a.png');
	const image = setup(() => src);
	image.onload('https://host/a.png');
	expect(image.show).toBe(true);
	src = 'https://host/b.png';
	flushSync();
	expect(image.src).toBe('https://host/b.png');
	expect(image.show).toBe(false);
	// A's request finishes late: neither a load nor an error for A may touch B.
	image.onload('https://host/a.png');
	expect(image.show).toBe(false);
	image.onload('https://host/b.png');
	expect(image.show).toBe(true);
	image.onerror('https://host/a.png');
	expect(image.show).toBe(true);
});

it('starts hidden again when the same src comes back after another one', () => {
	let src = $state<string | null>('https://host/a.png');
	const image = setup(() => src);
	image.onload('https://host/a.png');
	expect(image.show).toBe(true);
	src = null;
	flushSync();
	expect(image.src).toBeNull();
	expect(image.show).toBe(false);
	src = 'https://host/a.png';
	flushSync();
	expect(image.show).toBe(false);
});

it('ignores an event that names no src', () => {
	const image = setup(() => 'https://host/a.png');
	image.onload(null);
	expect(image.show).toBe(false);
	image.onerror(null);
	image.onload('https://host/a.png');
	expect(image.show).toBe(true);
});
