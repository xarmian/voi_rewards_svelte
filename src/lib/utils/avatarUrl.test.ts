import { expect, it } from 'vitest';
import { AVATAR_HOSTS, safeAvatarUrl } from './avatarUrl';

it('lists exactly the measured avatar hosts', () => {
	expect([...AVATAR_HOSTS]).toEqual([
		'prod.cdn.highforge.io',
		'images.nf.domains',
		'ipfsgw.nf.domains'
	]);
});

it.each([
	'https://prod.cdn.highforge.io/a/b.png',
	'https://images.nf.domains/avatar/abc.jpg',
	'https://ipfsgw.nf.domains/ipfs/bafy123'
])('accepts %s', (raw) => {
	expect(safeAvatarUrl(raw)).toBe(raw);
});

it.each([
	['another https host', 'https://cdn.example/a.png'],
	['a subdomain of an allowed host', 'https://x.prod.cdn.highforge.io/a.png'],
	['a suffix trick', 'https://prod.cdn.highforge.io.evil.example/a.png'],
	['a parent of an allowed host', 'https://nf.domains/a.png'],
	['an allowed host with a trailing dot', 'https://prod.cdn.highforge.io./a.png'],
	['an allowed host over http', 'http://prod.cdn.highforge.io/a.png'],
	['an allowed host with a port', 'https://images.nf.domains:8443/a.png'],
	['an allowed host with credentials', 'https://user:pw@images.nf.domains/a.png'],
	['an allowed host with a username', 'https://user@images.nf.domains/a.png'],
	['a non-string', 42],
	['null', null],
	['an empty string', ''],
	['a string longer than 2048', 'https://prod.cdn.highforge.io/' + 'x'.repeat(2019)],
	['a relative https: form', 'https:../api/x'],
	['a relative https: form naming an allowed host', 'https:prod.cdn.highforge.io/a.png'],
	['a non-URL', '1140535028']
])('refuses %s', (_, raw) => {
	expect(safeAvatarUrl(raw)).toBeNull();
});

it('accepts a 2048-character URL on an allowed host', () => {
	const url = 'https://prod.cdn.highforge.io/' + 'x'.repeat(2018);
	expect(url).toHaveLength(2048);
	expect(safeAvatarUrl(url)).toBe(url);
});

it('returns the parsed href, not the raw string', () => {
	expect(safeAvatarUrl('https://PROD.CDN.HighForge.IO/a b.png')).toBe(
		'https://prod.cdn.highforge.io/a%20b.png'
	);
	expect(safeAvatarUrl('HTTPS://images.nf.domains')).toBe('https://images.nf.domains/');
	expect(safeAvatarUrl('https://images.nf.domains:443/a.png')).toBe(
		'https://images.nf.domains/a.png'
	);
});
