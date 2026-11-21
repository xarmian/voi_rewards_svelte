// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// One import of the design-system barrel keeps every component it re-exports (app modules count
// as side-effectful), so pages must import from each component's own module instead.
const self = 'src/lib/ds/importGuard.test.ts';
const barrel = 'src/lib/ds/index.ts';
const barrelImport = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])\$lib\/ds\1/;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return /\.(ts|js|svelte)$/.test(entry.name) ? [path] : [];
	});
}

describe('design-system imports', () => {
	test('no module imports the $lib/ds barrel', () => {
		const offenders = sourceFiles('src')
			.filter((path) => path !== self && path !== barrel)
			.filter((path) => barrelImport.test(readFileSync(path, 'utf8')));
		expect(offenders).toEqual([]);
	});

	test('eslint restricts imports of the $lib/ds barrel', () => {
		const config = readFileSync('eslint.config.js', 'utf8');
		expect(config).toMatch(/'no-restricted-imports'/);
		expect(config).toMatch(/name:\s*'\$lib\/ds'/);
	});
});
