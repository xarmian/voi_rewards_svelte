// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

// One import of the design-system barrel keeps every component it re-exports (app modules count
// as side-effectful), so pages must import from each component's own module instead.
const self = 'src/lib/ds/importGuard.test.ts';
const barrel = 'src/lib/ds/index.ts';
// The barrel's own test imports it on purpose.
const barrelTest = 'src/lib/ds/primitives.test.ts';
const specifiers = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/g;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return /\.(ts|js|svelte)$/.test(entry.name) ? [path] : [];
	});
}

/** The local module a specifier names, without extension, or null for a package. */
function target(file: string, specifier: string): string | null {
	const path = specifier.startsWith('$lib/')
		? join('src/lib', specifier.slice('$lib/'.length))
		: specifier === '$lib'
			? 'src/lib'
			: specifier.startsWith('.')
				? join(dirname(file), specifier)
				: null;
	return path === null ? null : normalize(path).replace(/\.(ts|js)$/, '');
}

function importsBarrel(file: string, source: string): boolean {
	return [...source.matchAll(specifiers)].some(([, , specifier]) => {
		const resolved = target(file, specifier);
		return resolved === 'src/lib/ds' || resolved === 'src/lib/ds/index';
	});
}

describe('design-system imports', () => {
	test('the check sees every spelling of the barrel', () => {
		const page = 'src/routes/(site)/faq/+page.svelte';
		for (const specifier of ['$lib/ds', '$lib/ds/index', '$lib/ds/index.ts', '../../../lib/ds']) {
			expect(importsBarrel(page, `import { Card } from '${specifier}';`)).toBe(true);
		}
		expect(importsBarrel('src/lib/ds/Card/Card.svelte', "import x from '../index';")).toBe(true);
		expect(importsBarrel(page, "import { Card } from '$lib/ds/Card';")).toBe(false);
		expect(importsBarrel('src/lib/ds/Card/index.ts', "export { Card } from './index';")).toBe(
			false
		);
	});

	test('no module imports the $lib/ds barrel', () => {
		const offenders = sourceFiles('src')
			.filter((path) => ![self, barrel, barrelTest].includes(path))
			.filter((path) => importsBarrel(path, readFileSync(path, 'utf8')));
		expect(offenders).toEqual([]);
	});

	test('eslint restricts every alias spelling of the $lib/ds barrel', () => {
		const config = readFileSync('eslint.config.js', 'utf8');
		expect(config).toMatch(/'no-restricted-imports'/);
		for (const name of ['$lib/ds', '$lib/ds/index', '$lib/ds/index.ts', '$lib/ds/index.js']) {
			expect(config).toContain(`'${name}'`);
		}
		expect(config).toMatch(/patterns:\s*\[/);
	});
});
