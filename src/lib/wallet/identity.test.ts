import { afterEach, expect, it, vi } from 'vitest';
import { fetchWalletIdentity, parseWalletIdentity } from './identity';

const avatar = 'https://cdn.example/avatar.png';
const named = { address: 'A', name: ' shelly.of.voi ', metadata: { avatar } };
const empty = { name: null, avatar: null };
const ADDRESS = 'G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ';
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
	['explicit port', 'https://host.example:8443/x.png'],
	['.localdomain host', 'https://localhost.localdomain/x.png'],
	['.home.arpa host', 'https://router.home.arpa/x.png'],
	['.internal host', 'https://api.internal/x.png'],
	// WHATWG keeps a trailing dot in the hostname, so a suffix check on `.local` or `localhost` misses it.
	['trailing dot on a local host', 'https://printer.local./a.png'],
	['trailing dot on localhost', 'https://localhost./x.png'],
	['trailing dot on a public-looking host', 'https://cdn.example./x.png'],
	['percent-encoded trailing dot', 'https://foo.local%2e/x.png'],
	['ideographic full stop', 'https://foo.local\u3002/x.png'],
	['leading dot', 'https://.cdn.example/x.png'],
	['empty label', 'https://cdn..example/x.png']
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
	['a lower-case address look-alike', 'g3msa75ozejtccenojdldjk7ud7e2k5dnc7fvhcnov7e3i4dtxtowduifq'],
	["the hero's own short-address shape", 'G3MSA7\u2026UIFQ'],
	['the short-address shape with three dots', 'G3MS...UIFQ'],
	['an address with a zero for an O', ADDRESS.replace('O', '0')],
	['an address with a one for an I', ADDRESS.replace('I', '1')],
	['an address with a Cyrillic A', '\u0410' + ADDRESS.slice(1)],
	[
		'an address in fullwidth characters',
		[...ADDRESS].map((c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).join('')
	],
	['an address with a combining mark', ADDRESS + '\u0301'],
	['an address with a check mark', ADDRESS + '\u2713'],
	['an address split by a no-break space', ADDRESS.slice(0, 29) + '\u00a0' + ADDRESS.slice(29)],
	['an address split by an ideographic space', ADDRESS.slice(0, 29) + '\u3000' + ADDRESS.slice(29)],
	['a long name with no dot', 'a'.repeat(33)],
	['a short dotless name shaped like the short address', 'G3MSA7UIFQ'],
	['a dotless name without the .voi label', 'shelly'],
	['a name under another label', 'shelly.eth'],
	['a name made only of underscores', '___.voi'],
	['a name made only of hyphens', '---.voi'],
	['a label that starts with a hyphen', '-a.voi'],
	['a label of 64 characters', 'a'.repeat(64) + '.voi'],
	['the full address with .voi after it', ADDRESS + '.voi'],
	['the full address as a label before another', 'x.' + ADDRESS + '.voi'],
	['the full address in Lisu capitals with .voi', '\ua4d6' + ADDRESS.slice(1) + '.voi'],
	['a Lisu tone mark that looks like a dot', 'G3MSA7\ua4f8\ua4f8\ua4f8UIFQ'],
	['Lisu marks standing in for the dot of a name', 'xarmian\ua4f8voi'],
	['Arabic-Indic zeros that look like dots', 'G3MSA7\u0660\u0660\u0660UIFQ'],
	['a sinological dot', 'G3MSA7\ua78f\ua78f\ua78fUIFQ'],
	['a modifier letter triangular colon', 'G3MSA7\u02d0UIFQ'],
	['three combining dots above', 'G3MSA7\u20dbUIFQ'],
	['an Armenian letter among Latin ones', 's\u0570elly.voi'],
	['an Armenian letter in a later label', 'shelly.\u0585f.voi'],
	['a Cherokee letter', '\u13daelly.voi'],
	['a Lisu letter', 'X\ua4eeRMIAN.voi'],
	['a Latin small capital', 'sh\u1d07lly.voi'],
	['a dotless i', 'xarm\u0131an.voi'],
	['a stack of combining marks', 'p' + '\u0338'.repeat(40) + '.voi'],
	['an emoji', '\ud83d\udd25.voi'],
	['an accented name', 'caf\u00e9.voi'],
	['a Cyrillic name', '\u043f\u0440\u0438\u0432\u0435\u0442.voi'],
	['a combining grapheme joiner', 'sh\u034felly.voi'],
	['a variation selector', 'a\ufe0fb.voi'],
	['a hangul filler', 'a\u3164b.voi'],
	['a braille blank', 'a\u2800b.voi'],
	['a space inside the name', 'shelly of.voi'],
	['an ellipsis inside the name', 'shelly\u2026.voi'],
	['a Cyrillic letter among Latin ones', 'sh\u0435lly.of.voi'],
	['a Greek letter among Latin ones', 'sh\u03b5lly.voi']
])('shows no name and no avatar for %s (the record is not trusted)', (_, name) => {
	expect(parseWalletIdentity('A', [{ ...named, name }])).toEqual(empty);
});

it.each([
	'shelly.voi',
	'shelly.of.voi',
	'name-1_x.voi',
	'Shelly.VOI',
	'a.voi',
	'0.voi',
	'ab8'.repeat(21) + '.voi',
	'a'.repeat(57) + '.voi'
])('keeps the ordinary name %s', (name) => {
	expect(parseWalletIdentity('A', [{ ...named, name }]).name).toBe(name);
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
