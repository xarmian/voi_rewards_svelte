import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

function svelteFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? svelteFiles(path) : entry.name.endsWith('.svelte') ? [path] : [];
	});
}

test('vanity links always load a fresh document', () => {
	// A client-side move keeps scripts already in the document.
	for (const file of svelteFiles(fileURLToPath(new URL('../../', import.meta.url)))) {
		const source = readFileSync(file, 'utf8');
		for (const [tag] of source.matchAll(/<a\b[^>]*\bhref\s*=\s*["']\/vanity[^>]*>/gi)) {
			expect(tag, file).toMatch(/\sdata-sveltekit-reload(?=\s|=|>)/);
			expect(tag, file).not.toMatch(/data-sveltekit-reload\s*=\s*(?:["']false["']|\{false\})/);
		}
		expect(source, `${file}: use window.location.assign for vanity navigation`).not.toMatch(
			/\bgoto\s*\(\s*['"`]\/vanity/
		);
	}
});
