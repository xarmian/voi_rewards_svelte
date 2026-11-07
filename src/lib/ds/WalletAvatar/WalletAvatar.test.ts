import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import { parse, type AST } from 'svelte/compiler';
import { readFileSync } from 'node:fs';
import WalletAvatar from './WalletAvatar.svelte';

const gradient = 'linear-gradient(135deg, red, blue)';
it('server renders the decorative 64 px gradient square without an image for null src', () => {
	const html = render(WalletAvatar, { props: { gradient, src: null } }).body;
	expect(html).toContain(gradient);
	for (const token of ['h-16', 'w-16', 'shrink-0', 'rounded-ds-md', 'overflow-hidden'])
		expect(html).toContain(token);
	expect(html).toContain('aria-hidden="true"');
	expect(html).not.toContain('<img');
});

it('server renders exactly one hidden decorative image without sending a referrer', () => {
	const src = 'https://host/a.png';
	const html = render(WalletAvatar, { props: { gradient, src } }).body;
	const images = html.match(/<img\b[^>]*>/g) ?? [];
	expect(images).toHaveLength(1);
	expect(images[0]).toContain(`src="${src}"`);
	expect(images[0]).toContain('referrerpolicy="no-referrer"');
	expect(images[0]).toContain('alt=""');
	expect(images[0]).toContain('decoding="async"');
	expect(images[0]).toContain('opacity-0');
	expect(images[0]).toContain('object-cover');
	expect(images[0]).not.toContain('crossorigin');
});

it('uses only an img for the avatar and wires the module load and error handlers', () => {
	const source = readFileSync('src/lib/ds/WalletAvatar/WalletAvatar.svelte', 'utf8');
	const ast = parse(source, { modern: true });
	const elements: AST.RegularElement[] = [];
	const calls: import('estree').CallExpression[] = [];
	function visit(value: unknown) {
		if (!value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			value.forEach(visit);
			return;
		}
		const node = value as { type?: string };
		if (node.type === 'RegularElement') elements.push(value as AST.RegularElement);
		if (node.type === 'CallExpression') calls.push(value as import('estree').CallExpression);
		Object.values(value).forEach(visit);
	}
	visit(ast);
	const images = elements.filter((node) => node.name === 'img');
	expect(images).toHaveLength(1);
	expect(elements.some((node) => ['svg', 'object', 'embed', 'iframe'].includes(node.name))).toBe(
		false
	);
	expect(source).not.toMatch(/background-image|url\(/);
	expect(
		calls.filter(
			(call) => call.callee.type === 'Identifier' && call.callee.name === 'createAvatarImage'
		)
	).toHaveLength(1);
	// Each handler must name the src of the element that fired it. Svelte re-reads a member-expression
	// handler on every event, and a replaced image that is still loading keeps its listener, so a bare
	// `image.onload` would hand a late event from the previous account's image to the current one.
	for (const name of ['onload', 'onerror']) {
		const attribute = images[0].attributes.find(
			(attr) => attr.type === 'Attribute' && attr.name === name
		);
		expect(attribute).toMatchObject({
			value: { type: 'ExpressionTag', expression: { type: 'ArrowFunctionExpression' } }
		});
		const handler = source.slice(
			(attribute as AST.Attribute).start,
			(attribute as AST.Attribute).end
		);
		expect(handler.replace(/\s+/g, ' ')).toBe(
			`${name}={(event) => image.${name}(event.currentTarget.getAttribute('src'))}`
		);
	}
});
