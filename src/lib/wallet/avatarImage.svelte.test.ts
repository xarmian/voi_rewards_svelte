import { expect, it } from 'vitest';
import { createAvatarImage } from './avatarImage.svelte';

it('hides the image before load, shows after load, and hides after error', () => {
	const image = createAvatarImage(() => 'https://host/a.png');
	expect(image.src).toBe('https://host/a.png');
	expect(image.show).toBe(false);
	image.onload();
	expect(image.show).toBe(true);
	image.onerror();
	expect(image.show).toBe(false);
	image.onload();
	expect(image.show).toBe(false);
});

it('resets for a new src and ignores old handlers after the new image loads', () => {
	let src = $state<string | null>('https://host/a.png');
	const image = createAvatarImage(() => src);
	const oldError = image.onerror;
	const oldLoad = image.onload;
	image.onload();
	expect(image.show).toBe(true);
	src = 'https://host/b.png';
	expect(image.src).toBe('https://host/b.png');
	expect(image.show).toBe(false);
	oldLoad();
	expect(image.show).toBe(false);
	image.onload();
	expect(image.show).toBe(true);
	oldError();
	expect(image.show).toBe(true);
	src = 'https://host/a.png';
	expect(image.show).toBe(false);
	src = null;
	expect(image.src).toBeNull();
	expect(image.show).toBe(false);
	image.onload();
	expect(image.show).toBe(false);
});
