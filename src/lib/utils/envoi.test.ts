import { afterEach, expect, it, vi } from 'vitest';
import { getEnvoiNames, resolveEnvoiToken, searchEnvoi } from './envoi';

const allowed = 'https://prod.cdn.highforge.io/avatar.png';
const offList = 'https://cdn.example/avatar.png';

function records() {
	return [
		{
			token_id: '1',
			address: 'A',
			name: 'a.voi',
			cached: true,
			metadata: { avatar: allowed, url: 'https://a.example', 'com.twitter': 'a' }
		},
		{
			token_id: '2',
			address: 'B',
			name: 'b.voi',
			cached: false,
			metadata: { avatar: offList, location: 'here', 'com.github': 'b' }
		},
		{ token_id: '3', address: 'C', name: 'c.voi', cached: false }
	];
}

function stubFetch() {
	const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ results: records() }) }));
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

afterEach(() => vi.unstubAllGlobals());

it.each([
	['getEnvoiNames', () => getEnvoiNames(['A', 'B', 'C'])],
	['searchEnvoi', () => searchEnvoi('voi')],
	['resolveEnvoiToken', () => resolveEnvoiToken(['1', '2', '3'])]
])(
	'%s keeps allowlisted avatars, drops off-list ones and leaves other metadata',
	async (_, call) => {
		stubFetch();
		const results = await call();
		expect(results).toHaveLength(3);
		const [a, b, c] = results;
		expect(a.metadata).toEqual({ avatar: allowed, url: 'https://a.example', 'com.twitter': 'a' });
		expect(b.metadata).toEqual({ location: 'here', 'com.github': 'b' });
		expect('avatar' in b.metadata).toBe(false);
		expect(c.metadata).toBeUndefined();
		expect(a.name).toBe('a.voi');
		expect(b.address).toBe('B');
	}
);

it.each([
	['getEnvoiNames', () => getEnvoiNames(['A'])],
	['searchEnvoi', () => searchEnvoi('a')],
	['resolveEnvoiToken', () => resolveEnvoiToken(['1'])]
])('%s returns the parsed href of an allowlisted avatar', async (_, call) => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: true,
			json: async () => ({
				results: [
					{
						address: 'A',
						name: 'a.voi',
						cached: true,
						metadata: { avatar: 'https://PROD.cdn.highforge.io/a b.png' }
					}
				]
			})
		}))
	);
	const [result] = await call();
	expect(result.metadata.avatar).toBe('https://prod.cdn.highforge.io/a%20b.png');
});
