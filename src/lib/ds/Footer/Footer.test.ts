import { test } from 'vitest';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import Footer from './Footer.svelte';
import { X_URL, footerLinks } from './links';

test('footer provides the specified destinations and external-link announcements', () => {
	const html = render(Footer).body;
	assert.match(html, /voirewards.com · unofficial, community-run/);
	const nav = html.match(/<nav aria-label="Footer"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
	const anchors = [...nav.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
	assert.equal(anchors.length, 7);
	assert.deepEqual(
		footerLinks.map((link) => link.label),
		['About', 'About Voi', 'FAQ', 'Privacy', 'Source', 'Discord', 'X']
	);
	footerLinks.forEach((link, i) => {
		assert.ok(anchors[i].includes(`href="${link.href}"`));
		assert.ok(anchors[i].includes(link.label));
		if (link.external) {
			assert.match(anchors[i], /target="_blank"/);
			assert.match(anchors[i], /rel="[^"]*noopener/);
			assert.match(anchors[i], /class="sr-only"> \(opens in a new tab\)/);
		} else assert.doesNotMatch(anchors[i], /target=/);
	});
	assert.match(anchors[1], /href="https:\/\/ecosystem\.voi\.network"/);
	assert.match(anchors[1], /aria-hidden="true">↗/);
	assert.ok(anchors[6].includes(`href="${X_URL}"`));
	assert.doesNotMatch(html, /href="\/(?:ecosystem|archive)/);
});
