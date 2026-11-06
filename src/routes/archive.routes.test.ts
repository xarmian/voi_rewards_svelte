import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const site = 'src/routes/(site)';
const archive = `${site}/archive/testnet`;
const routes = ['phase1', 'phase2', 'leaderboard', 'quests', 'reports', 'relays'];
const pages = [
	'phase1',
	'phase2/[...slug]',
	'leaderboard',
	'quests',
	'quests/[...projectId]',
	'reports',
	'relays'
];

test.each(pages)('%s has an archive banner', (page) => {
	const path = `${archive}/${page}/+page.svelte`;
	expect(existsSync(path)).toBe(true);
	const source = readFileSync(path, 'utf8');
	expect(source).toContain('<ArchiveBanner');
	expect(source).toContain('programme=');
});

// A banner that names a date states a fact about the page's data that the loader does not guarantee
// (the relays page shows the latest week in the database), so banners say only that a programme ended.
test.each(pages)('%s banner states no hard-coded date', (page) => {
	const source = readFileSync(`${archive}/${page}/+page.svelte`, 'utf8');
	expect(source).not.toMatch(/<ArchiveBanner[^>]*\b(frozenAt|endedOn)\s*=/);
});

test('the archive hub links all six programmes', () => {
	const path = `${archive}/+page.svelte`;
	expect(existsSync(path)).toBe(true);
	const source = readFileSync(path, 'utf8');
	for (const route of routes) expect(source).toContain(`/archive/testnet/${route}`);
});

test.each([...routes.map((route) => `${site}/${route}`), 'src/routes/arc72'])(
	'%s has been removed',
	(path) => expect(existsSync(path)).toBe(false)
);

// A prerendered page is written out as a static file, and the host serves a static file before any
// server hook runs, so a prerendered redirect source would never redirect in production. Every route
// that the redirect table sends elsewhere and that still has files on disk must be rendered on request.
test.each(['what_is_voi', 'ecosystem/[...category]', 'accounts', 'accounts/auth'])(
	'the redirect source %s is not prerendered',
	(route) => {
		for (const file of ['+page.ts', '+page.server.ts']) {
			const path = `${site}/${route}/${file}`;
			if (!existsSync(path)) continue;
			expect(readFileSync(path, 'utf8')).not.toMatch(/export\s+const\s+prerender\s*=\s*true/);
		}
	}
);

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? sourceFiles(path) : /\.(svelte|ts)$/.test(path) ? [path] : [];
	});
}

test('source links use the new destinations', () => {
	const excluded = new Set([
		'src/lib/server/redirects.ts',
		'src/lib/server/redirects.test.ts',
		'src/routes/archive.routes.test.ts'
	]);
	const stale = sourceFiles('src')
		.filter((path) => !excluded.has(path))
		.flatMap((path) =>
			readFileSync(path, 'utf8')
				.split('\n')
				.flatMap((line, i) =>
					/href="\/(phase1|phase2|leaderboard|quests|reports|relays|arc72)/.test(line)
						? [`${path}:${i + 1}: ${line.trim()}`]
						: []
				)
		);
	expect(stale).toEqual([]);
});
