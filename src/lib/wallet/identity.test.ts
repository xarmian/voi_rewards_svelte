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
	['invalid URL', 'https://[invalid']
])('rejects %s avatars while keeping the name', (_, value) => {
	expect(parseWalletIdentity('A', [{ ...named, metadata: { avatar: value } }])).toEqual({
		name: 'shelly.of.voi',
		avatar: null
	});
});

it('accepts a 2048-character https avatar and keeps the original URL', () => {
	const url = 'https://host/' + 'x'.repeat(2035);
	expect(url).toHaveLength(2048);
	expect(parseWalletIdentity('A', [{ ...named, metadata: { avatar: url } }]).avatar).toBe(url);
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
