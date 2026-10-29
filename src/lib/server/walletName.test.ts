import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveWalletName } from './walletName';

const address = 'G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ';
const fast = { timeoutMs: 5, retryDelayMs: () => 0 };
const known = () => Response.json({ results: [{ name: 'shelly.of.voi', address }] });
// Headers arrive, the body never finishes.
const stalledBody = () =>
	new Response(new ReadableStream({ start: () => {} }), {
		headers: { 'content-type': 'application/json' }
	});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('resolveWalletName', () => {
	it('resolves a known name and lowercases the request URL', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(known());

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
		'returns not-found for %j without retrying',
		async (body) => {
			const fetcher = vi.fn<typeof fetch>(async () => Response.json(body));
			expect(await resolveWalletName('unknown.of.voi', fetcher, fast)).toEqual({
				kind: 'not-found'
			});
			expect(fetcher).toHaveBeenCalledOnce();
		}
	);

	it('returns unavailable for HTTP 500 after one retry', async () => {
		const fetcher = vi.fn<typeof fetch>(async () =>
			Response.json({ results: [{ address }] }, { status: 500 })
		);
		expect(await resolveWalletName('shelly.of.voi', fetcher, fast)).toEqual({
			kind: 'unavailable'
		});
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('returns unavailable for HTTP 404 without retrying', async () => {
		const fetcher = vi.fn<typeof fetch>(async () =>
			Response.json({ results: [{ address }] }, { status: 404 })
		);
		expect(await resolveWalletName('shelly.of.voi', fetcher, fast)).toEqual({
			kind: 'unavailable'
		});
		expect(fetcher).toHaveBeenCalledOnce();
	});

	it('returns unavailable when fetch rejects twice', async () => {
		const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('network failed'));
		expect(await resolveWalletName('shelly.of.voi', fetcher, fast)).toEqual({
			kind: 'unavailable'
		});
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('bounds a fetch that never resolves and ignores cancellation, on both attempts', async () => {
		const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
		expect(await resolveWalletName('shelly.of.voi', fetcher, fast)).toEqual({
			kind: 'unavailable'
		});
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(fetcher.mock.calls.map((call) => call[1]?.signal?.aborted)).toEqual([true, true]);
	});

	it('bounds a body that stalls after the headers', async () => {
		const fetcher = vi.fn<typeof fetch>(async () => stalledBody());
		expect(await resolveWalletName('shelly.of.voi', fetcher, fast)).toEqual({
			kind: 'unavailable'
		});
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it.each([
		['a 503', () => Response.json({}, { status: 503 })],
		['a rejected fetch', () => Promise.reject(new Error('network failed'))],
		['a fetch that never resolves', () => new Promise<Response>(() => {})],
		['a stalled body', stalledBody]
	])('retries once after %s and then resolves', async (_label, firstAnswer) => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockImplementationOnce(async () => firstAnswer())
			.mockResolvedValueOnce(known());
		expect(await resolveWalletName('shelly.of.voi', fetcher, fast)).toEqual({
			kind: 'address',
			address
		});
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('waits the retry delay between attempts', async () => {
		vi.useFakeTimers();
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({}, { status: 503 }))
			.mockResolvedValueOnce(known());
		const result = resolveWalletName('shelly.of.voi', fetcher, { retryDelayMs: () => 300 });
		await vi.advanceTimersByTimeAsync(299);
		expect(fetcher).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1);
		expect(await result).toEqual({ kind: 'address', address });
	});

	it('keeps two stalled attempts with the default deadlines under 6 s', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(1); // the longest jitter: 400 ms
		const fetcher = vi.fn<typeof fetch>(async () => stalledBody());
		let settled = false;
		const result = resolveWalletName('shelly.of.voi', fetcher).then((r) => {
			settled = true;
			return r;
		});
		await vi.advanceTimersByTimeAsync(5399);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(await result).toEqual({ kind: 'unavailable' });
		expect(settled).toBe(true);
	});

	it('returns unavailable for a non-JSON response without retrying', async () => {
		const fetcher = vi.fn<typeof fetch>(async () => new Response('not JSON'));
		expect(await resolveWalletName('shelly.of.voi', fetcher, fast)).toEqual({
			kind: 'unavailable'
		});
		expect(fetcher).toHaveBeenCalledOnce();
	});

	it.each([
		null,
		{},
		{ results: null },
		{ results: [{}] },
		{ results: [null] },
		{ results: [{ address: 42 }] }
	])('returns unavailable for a malformed body without retrying: %j', async (body) => {
		const fetcher = vi.fn<typeof fetch>(async () => Response.json(body));
		expect(await resolveWalletName('shelly.of.voi', fetcher, fast)).toEqual({
			kind: 'unavailable'
		});
		expect(fetcher).toHaveBeenCalledOnce();
	});

	it('returns unavailable for an address with an invalid checksum', async () => {
		expect(
			await resolveWalletName(
				'shelly.of.voi',
				async () => Response.json({ results: [{ address: address.slice(0, -1) + 'A' }] }),
				fast
			)
		).toEqual({ kind: 'unavailable' });
	});
});
