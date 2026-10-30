import { test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import type { IProject } from '$lib/data/types';
import ProjectCard from './ProjectCard.svelte';

const project: IProject = {
	id: 1,
	title: 'Example project',
	description: 'A project in the directory',
	category: 'Tools',
	type: 'project',
	quests: [],
	url: 'https://example.com',
	twitter: 'https://x.com/example'
};

test('card links and category control never nest interactive elements', () => {
	const html = render(ProjectCard, { props: { project } }).body;
	const stack: string[] = [];
	const voidTags = new Set([
		'area',
		'base',
		'br',
		'col',
		'embed',
		'hr',
		'img',
		'input',
		'link',
		'meta',
		'param',
		'source',
		'track',
		'wbr'
	]);
	for (const tag of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi)) {
		const [, closing, name] = tag;
		if (closing) {
			assert.equal(stack.pop(), name);
		} else {
			if (name === 'a' || name === 'button') {
				assert.ok(!stack.some((ancestor) => ancestor === 'a' || ancestor === 'button'));
			}
			if (!voidTags.has(name) && !tag[0].endsWith('/>')) stack.push(name);
		}
	}
	assert.equal(stack.length, 0);
	assert.match(html, /<a[^>]*href="https:\/\/example.com"[^>]*>[^<]*Example project/);
	assert.match(html, /<a[^>]*href="https:\/\/x.com\/example"/);
});

test('card without a project URL has no empty link', () => {
	const html = render(ProjectCard, { props: { project: { ...project, url: undefined } } }).body;
	assert.doesNotMatch(html, /href=""/);
});
