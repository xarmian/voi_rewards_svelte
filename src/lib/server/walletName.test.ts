import { describe, expect, it, vi } from 'vitest';
import { resolveWalletName } from './walletName';

const address = 'G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ';

describe('resolveWalletName', () => {
	it('resolves a known name and lowercases the request URL', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			Response.json({ results: [{ name: 'shelly.of.voi', address }] })
		);

		expect(await resolveWalletName('Shelly.Of.Voi', fetcher)).toEqual({ kind: 'address', address });
		expect(fetcher).toHaveBeenCalledOnce();
		expect(fetcher.mock.calls[0][0]).toBe('https://api.envoi.sh/api/address/shelly.of.voi');
	});

	it('encodes the name as a URL path segment', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ results: [] }));
		await resolveWalletName('Shelly/Of.Voi', fetcher);
		expect(fetcher.mock.calls[0][0]).toBe('https://api.envoi.sh/api/address/shelly%2Fof.voi');
	});

	it.each([{ results: [{ address: null }] }, { results: [] }])(
		'returns not-found for %j',
		async (body) => {
			expect(await resolveWalletName('unknown.of.voi', async () => Response.json(body))).toEqual({
				kind: 'not-found'
			});
		}
	);

	it.each([500, 404])('returns unavailable for HTTP %s', async (status) => {
		expect(
			await resolveWalletName('shelly.of.voi', async () =>
				Response.json({ results: [{ address }] }, { status })
			)
		).toEqual({ kind: 'unavailable' });
	});

	it('returns unavailable when fetch rejects', async () => {
		const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('network failed'));
		expect(await resolveWalletName('shelly.of.voi', fetcher)).toEqual({ kind: 'unavailable' });
	});

	it('bounds a fetch that never resolves and ignores cancellation', async () => {
		const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
		expect(await resolveWalletName('shelly.of.voi', fetcher, 5)).toEqual({ kind: 'unavailable' });
		expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
	});

	it('returns unavailable for a non-JSON response', async () => {
		expect(
			await resolveWalletName('shelly.of.voi', async () => new Response('not JSON'))
		).toEqual({ kind: 'unavailable' });
	});

	it.each([
		null,
		{},
		{ results: null },
		{ results: [{}] },
		{ results: [null] },
		{ results: [{ address: 42 }] }
	])('returns unavailable for a malformed body: %j', async (body) => {
		expect(await resolveWalletName('shelly.of.voi', async () => Response.json(body))).toEqual({
			kind: 'unavailable'
		});
	});

	it('returns unavailable for an address with an invalid checksum', async () => {
		expect(
			await resolveWalletName('shelly.of.voi', async () =>
				Response.json({ results: [{ address: address.slice(0, -1) + 'A' }] })
			)
		).toEqual({ kind: 'unavailable' });
	});
});
