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
