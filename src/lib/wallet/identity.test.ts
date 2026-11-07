import { afterEach, expect, it, vi } from 'vitest';
import { fetchWalletIdentity, parseWalletIdentity } from './identity';

const avatar = 'https://cdn.example/avatar.png';
const named = { address: 'A', name: ' shelly.of.voi ', metadata: { avatar } };
const empty = { name: null, avatar: null };
afterEach(() => vi.useRealTimers());

it('chooses the named result for the requested address among several results', () => {
	expect(
		parseWalletIdentity('A', [
			{ address: 'A', type: 'collection' },
			{ ...named, address: 'B', name: 'other.voi' },
			{ address: 'A', type: 'staking' },
			named
		])
	).toEqual({ name: 'shelly.of.voi', avatar });
});

it.each([
	['http', 'http://host/x.png'],
	['data', 'data:image/png;base64,AAAA'],
	['javascript', 'javascript:alert(1)'],
	['blob', 'blob:https://host/id'],
	['protocol-relative', '//host/x.png'],
	['relative', '/x.png'],
	['credentials', 'https://user:pw@host/x.png'],
	['username', 'https://user@host/x.png'],
	['password', 'https://:pw@host/x.png'],
	['empty', ''],
	['too long', 'https://host/' + 'x'.repeat(2036)],
	['non-string', 42],
	['invalid URL', 'https://[invalid'],
	// WHATWG treats these as relative to the page when parsed with the page as base, so the browser
	// would load a same-origin path that the validator never saw as a host.
	['relative with dot segments', 'https:../api/x?y=1'],
	['relative with one slash', 'https:/host/x.png'],
	['relative without slashes', 'https:host/x.png'],
	['relative with a plausible host', 'https:/cdn.example/x.png'],
	['relative without slashes, plausible host', 'https:cdn.example/x.png'],
	['leading whitespace', ' https://host.example/x.png'],
	['IPv4 literal', 'https://127.0.0.1/x.png'],
	['private IPv4 literal', 'https://192.168.1.1/x.png'],
	['decimal IPv4 literal', 'https://2130706433/x.png'],
	['IPv6 literal', 'https://[::1]/x.png'],
	['host without a dot', 'https://intranet/x.png'],
	['localhost', 'https://localhost/x.png'],
	['.local host', 'https://printer.local/x.png'],
	['explicit port', 'https://host.example:8443/x.png']
])('rejects %s avatars while keeping the name', (_, value) => {
	expect(parseWalletIdentity('A', [{ ...named, metadata: { avatar: value } }])).toEqual({
		name: 'shelly.of.voi',
		avatar: null
	});
});

it('accepts a 2048-character https avatar', () => {
	const url = 'https://host.example/' + 'x'.repeat(2027);
	expect(url).toHaveLength(2048);
	expect(parseWalletIdentity('A', [{ ...named, metadata: { avatar: url } }]).avatar).toBe(url);
});

it('returns the parsed href, so the host that was checked is the host the browser loads', () => {
	for (const [raw, href] of [
		['HTTPS://CDN.Example/a b.png', 'https://cdn.example/a%20b.png'],
		['https://cdn.example', 'https://cdn.example/'],
		['https://cdn.example:443/a.png', 'https://cdn.example/a.png']
	])
		expect(parseWalletIdentity('A', [{ ...named, metadata: { avatar: raw } }]).avatar).toBe(href);
});

it.each([
	['a right-to-left override', 'safe\u202Egnp.exe'],
	['a bidi isolate', 'a\u2066b.voi'],
	['a zero-width space', 'sh\u200Belly.voi'],
	['a control character', 'a\u0007b.voi'],
	['a line separator', 'a\u2028b.voi'],
	['a name longer than 128 characters', 'a'.repeat(129)],
	[
		'a name that looks like an address',
		'G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ'
	],
	['a lower-case address look-alike', 'g3msa75ozejtccenojdldjk7ud7e2k5dnc7fvhcnov7e3i4dtxtowduifq']
])('shows no name and no avatar for %s (the record is not trusted)', (_, name) => {
	expect(parseWalletIdentity('A', [{ ...named, name }])).toEqual(empty);
});

it('keeps an ordinary unicode name', () => {
	expect(parseWalletIdentity('A', [{ ...named, name: 'café.voi' }]).name).toBe('café.voi');
});

it.each([[], [{ address: 'A' }], [{ ...named, address: 'B' }], [{ ...named, name: '   ' }]])(
	'returns nulls without a matching non-empty name: %j',
	(...results) => {
		expect(parseWalletIdentity('A', results)).toEqual(empty);
	}
);

it('keeps a name with missing avatar metadata', () => {
	expect(parseWalletIdentity('A', [{ address: 'A', name: 'shelly.of.voi' }])).toEqual({
		name: 'shelly.of.voi',
		avatar: null
	});
});

it('looks up only the requested address and parses the result', async () => {
	const lookup = vi.fn(async () => [named]);
	await expect(fetchWalletIdentity('A', lookup)).resolves.toEqual({
		name: 'shelly.of.voi',
		avatar
	});
	expect(lookup).toHaveBeenCalledExactlyOnceWith(['A']);
});

it('returns nulls without throwing when lookup rejects or throws synchronously', async () => {
	await expect(
		fetchWalletIdentity('A', async () => {
			throw new Error('offline');
		})
	).resolves.toEqual(empty);
	await expect(
		fetchWalletIdentity('A', () => {
			throw new Error('offline');
		})
	).resolves.toEqual(empty);
});

it('times out a pending lookup and ignores its late result', async () => {
	vi.useFakeTimers();
	let resolve!: (results: unknown[]) => void;
	const pending = fetchWalletIdentity(
		'A',
		() =>
			new Promise((done) => {
				resolve = done;
			})
	);
	await vi.advanceTimersByTimeAsync(5000);
	await expect(pending).resolves.toEqual(empty);
	resolve([named]);
	await expect(pending).resolves.toEqual(empty);
	expect(vi.getTimerCount()).toBe(0);
});
