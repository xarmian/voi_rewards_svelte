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
	const html = render(ProjectCard, { props: { project, categoryHref: '/directory/Tools' } }).body;
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
	assert.match(html, /<h2[^>]*>\s*Example project\s*<\/h2>/);
	assert.match(html, /<a[^>]*href="https:\/\/example.com"[^>]*>[\s\S]*?Website/);
	assert.match(html, /<a[^>]*href="\/directory\/Tools"[^>]*>\s*Tools\s*<\/a>/);
	assert.doesNotMatch(html, /<h2[^>]*>[\s\S]*?<a[\s\S]*?<\/h2>/);
	assert.equal([...html.matchAll(/rel="noopener noreferrer"/g)].length, 2);
	assert.equal([...html.matchAll(/opens in a new tab/g)].length, 2);
	assert.match(html, /<a[^>]*href="https:\/\/x.com\/example"/);
});

test('card without a project URL has no empty link', () => {
	const html = render(ProjectCard, {
		props: {
			project: { ...project, url: undefined, twitter: undefined },
			categoryHref: '/directory/Tools'
		}
	}).body;
	assert.doesNotMatch(html, /href=""/);
});

test('card without external links still shows its title, full description and category', () => {
	const description = 'A long description. '.repeat(30);
	const html = render(ProjectCard, {
		props: {
			project: { ...project, description, url: undefined, twitter: undefined },
			categoryHref: '/directory/Tools'
		}
	}).body;
	assert.ok(html.includes(description));
	assert.match(html, /<h2[^>]*>\s*Example project\s*<\/h2>/);
	assert.equal([...html.matchAll(/<a /g)].length, 1);
	assert.doesNotMatch(html, /Website|Twitter|href=""/);
	assert.match(html, /aria-hidden="true"[^>]*>\s*E/);
});
test('logo is decorative, keeps mode hints and New is a word marker', () => {
	const html = render(ProjectCard, {
		props: {
			project: { ...project, logo: '/logo.png', logo_dark_mode: 'invert', new: true },
			categoryHref: '/directory/Tools'
		}
	}).body;
	assert.match(html, /<img[^>]*alt=""/);
	assert.match(html, /dark:invert dark:brightness-\[1.7\]/);
	assert.match(html, />New</);
});
