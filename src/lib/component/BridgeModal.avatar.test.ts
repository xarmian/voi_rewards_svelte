import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./BridgeModal.svelte', import.meta.url), 'utf8');
const avatar = readFileSync(new URL('./NameAvatar.svelte', import.meta.url), 'utf8');

function section(start: string, end: string): string {
	const from = source.indexOf(start);
	expect(from).toBeGreaterThan(-1);
	const to = source.indexOf(end, from);
	expect(to).toBeGreaterThan(from);
	return source.slice(from, to);
}

test('no avatar image hides itself and reaches for a sibling that is not there', () => {
	expect(source).not.toContain('nextElementSibling');
	expect(source).not.toMatch(/<img[^>]*\bon:?error=/);
});

test('source search rows render the avatar through NameAvatar at the row size', () => {
	const rows = section('{#each sourceSearchResults as result, i}', '{/each}');
	expect(rows).toMatch(
		/<NameAvatar\s+name=\{result\.name\}\s+avatar=\{'owner' in result \? getAvatarUrl\(result\) : null\}\s+size="md"\s*\/>/
	);
	expect(rows).not.toContain('<img');
});

test('the resolved source name renders the avatar through NameAvatar at the small size', () => {
	const block = section('{#if algorandSourceResolvedName}', '{/if}');
	expect(block).toMatch(
		/<NameAvatar\s+name=\{algorandSourceResolvedName\.name\}\s+avatar=\{algorandSourceResolvedName\.avatar\}\s*\/>/
	);
	expect(block).not.toContain('size=');
	expect(block).not.toContain('<img');
});

test('both destination search row lists render the avatar through NameAvatar at the row size', () => {
	const lists = source.split('{#each searchResults as result, i}').slice(1);
	expect(lists).toHaveLength(2);
	for (const list of lists) {
		const rows = list.slice(0, list.indexOf('{/each}'));
		expect(rows).toMatch(
			/<NameAvatar\s+name=\{result\.name\}\s+avatar=\{'owner' in result \? getAvatarUrl\(result\) : result\.avatar\}\s+size="md"\s*\/>/
		);
		expect(rows).not.toContain('<img');
	}
	expect(source.match(/<NameAvatar[^>]*size="md"/g)).toHaveLength(3);
});

test('NameAvatar takes a size defaulting to small and falls back to the initial on error', () => {
	expect(avatar).toMatch(/size\s*=\s*'sm'/);
	expect(avatar).toMatch(/size\?:\s*'sm'\s*\|\s*'md'/);
	expect(avatar).toContain('{#if avatar && !broken}');
	expect(avatar).toContain('onerror={() => (broken = true)}');
	expect(avatar).toMatch(/md:\s*'h-8 w-8[^']*text-base/);
	expect(avatar).toMatch(/sm:\s*'h-6 w-6[^']*text-xs/);
	expect(avatar).toContain('bg-blue-700');
	expect(avatar).not.toContain('bg-blue-500');
	expect(avatar).toContain('data-testid="name-avatar"');
	expect(avatar).toContain('alt=""');
});
