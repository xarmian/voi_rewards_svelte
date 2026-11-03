import { readFileSync, existsSync } from 'node:fs';
import { expect, test } from 'vitest';

const file = new URL('./ResolvedAddress.svelte', import.meta.url);
const source = existsSync(file) ? readFileSync(file, 'utf8') : '';

test('renders the complete receiver in a wrapping monospace element', () => {
	const element = source.match(
		/<([\w]+)\b([^>]*data-testid="resolved-address"[^>]*)>([^]*?)<\/\1>/
	);
	expect(element, 'Render the address in an element marked resolved-address').not.toBeNull();
	expect(element?.[2], 'The address must use font-mono and break-all').toMatch(
		/class="[^"]*font-mono[^"]*break-all/
	);
	expect(element?.[2], 'Expose the full receiver in the title').toContain('title={address}');
	expect(element?.[3], 'Render address whole').toContain('{address}');
	expect(source, 'Never slice a resolved address').not.toMatch(/\.slice\s*\(/);
});
test('provides an accessible, guarded Copy button', () => {
	expect(source, 'Include a Copy button').toMatch(
		/<button\b[^]*?aria-label="Copy address"[^]*?>\s*Copy\s*<\/button>/
	);
	expect(source).toMatch(/navigator\.clipboard(?:\?|)\.writeText\(address\)/);
	expect(source, 'Guard unavailable clipboard support').toMatch(
		/navigator\?\.clipboard|navigator\.clipboard\?|if\s*\([^)]*navigator\.clipboard/
	);
});

test('the address and its Copy button share one line and the name is never rendered', () => {
	expect(source, 'No name prop').not.toMatch(/\bname\b/);
	expect(source, 'Address and Copy sit in one flex row').toMatch(
		/<div class="[^"]*\bflex\b[^"]*">\s*(?:\{#if label\}[^]*?\{\/if\}\s*)?<div[^>]*data-testid="resolved-address"[^]*?<\/div>\s*<button/
	);
});
