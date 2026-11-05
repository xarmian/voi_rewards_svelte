import { afterEach, expect, test, vi } from 'vitest';
import { isVanityPath, newNonce, nonceInlineScripts, vanityCsp } from './vanityCsp';

afterEach(() => vi.restoreAllMocks());

test.each([
	['/vanity', true],
	['/vanity/', true],
	['/vanity/nested', true],
	['/vanityfoo', false],
	['/', false],
	['/wallet/x', false]
] as const)('isVanityPath(%s) is %s', (path, expected) => {
	expect(isVanityPath(path)).toBe(expected);
});

test('creates a base64 nonce from sixteen cryptographically random bytes', () => {
	const random = vi.spyOn(crypto, 'getRandomValues');
	const first = newNonce();
	const second = newNonce();
	expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/);
	expect(Buffer.from(first, 'base64')).toHaveLength(16);
	expect(second).not.toBe(first);
	expect(random).toHaveBeenCalledTimes(2);
	expect(random.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
	expect(random.mock.calls[0][0]?.byteLength).toBe(16);
});

test('allows only local scripts, stylesheets and workers plus nonce-bearing inline scripts', () => {
	expect(vanityCsp('test-nonce')).toBe(
		"script-src 'self' 'nonce-test-nonce'; style-src 'self' 'unsafe-inline'; worker-src 'self'; object-src 'none'; base-uri 'self'"
	);
});

test('lets no remote stylesheet through: style-src names no host', () => {
	const style = vanityCsp('n')
		.split('; ')
		.find((part) => part.startsWith('style-src '));
	expect(style).toBe("style-src 'self' 'unsafe-inline'");
	expect(style).not.toMatch(/https?:|\*/);
});

test('nonces theme, recaptcha and bootstrap inline scripts while preserving existing attributes', () => {
	const html =
		'<script id="theme-init">theme()</script>' +
		'<script>window.recaptcha = {};</script>' +
		'<script>__sveltekit = {}; start();</script>' +
		'<script type="module" data-test="value">boot()</script>' +
		'<SCRIPT defer>upper()</SCRIPT>' +
		'<script defer src="/app.js"></script>' +
		'<script type="module" nonce="existing">keep()</script>';
	const output = nonceInlineScripts(html, 'test-nonce');
	expect(output).toBe(
		'<script nonce="test-nonce" id="theme-init">theme()</script>' +
			'<script nonce="test-nonce">window.recaptcha = {};</script>' +
			'<script nonce="test-nonce">__sveltekit = {}; start();</script>' +
			'<script nonce="test-nonce" type="module" data-test="value">boot()</script>' +
			'<script nonce="test-nonce" defer>upper()</SCRIPT>' +
			'<script defer src="/app.js"></script>' +
			'<script type="module" nonce="existing">keep()</script>'
	);
	expect(nonceInlineScripts(output, 'another-nonce')).toBe(output);
});
