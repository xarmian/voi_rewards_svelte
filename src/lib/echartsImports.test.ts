import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'vitest';

function files(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
	});
}

test('src never imports the full ECharts runtime', () => {
	const root = new URL('../', import.meta.url).pathname;
	const violations: string[] = [];
	for (const file of files(root)) {
		const source = readFileSync(file, 'utf8');
		const imports = source.matchAll(
			/\bimport\s+(type\s+)?([^;]*?)\s+from\s*(['"])echarts\3|\bimport\s*(?:\(\s*)?(['"])echarts\4/g
		);
		for (const match of imports) {
			if (match[1]) continue;
			// Also permit inline type-only named imports.
			if (/^\{\s*type\s+[^}]+\}$/.test(match[2]?.trim() ?? '')) {
				const names = match[2]
					.trim()
					.slice(1, -1)
					.split(',')
					.map((name) => name.trim())
					.filter(Boolean);
				if (names.every((name) => /^type\s+/.test(name))) continue;
			}
			violations.push(relative(root, file));
		}
	}
	expect(violations).toEqual([]);
});
