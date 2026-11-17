import { expect, it, vi } from 'vitest';
import { createArc72Reader } from './arc72Export';

const query = { address: 'A', minRound: 1n, maxRound: 100n };

it('reads one same-origin uncached bounded window with a fixed limit and zero offset', async () => {
	const data = { transfers: [], 'next-token': null, 'total-count': 0, 'current-round': 100 };
	const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data })));
	const signal = new AbortController().signal;
	expect(await createArc72Reader(fetcher).readArc72Page(query, signal)).toEqual(data);
	expect(fetcher).toHaveBeenCalledTimes(1);
	expect(fetcher).toHaveBeenLastCalledWith(
		'/api/mimir?action=get_arc72_transfers&user=A&min-round=1&max-round=100&limit=1000&next-token=0',
		{ signal, cache: 'no-store' }
	);
});
it('preserves HTTP status and headers for scheduler backoff', async () => {
	const headers = new Headers({ 'Retry-After': '3' });
	const reader = createArc72Reader(
		vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429, headers }))
	);
	const failure = reader.readArc72Page(query, new AbortController().signal);
	await expect(failure).rejects.toMatchObject({
		message: 'NFT request failed (429).',
		response: { status: 429, headers: expect.any(Headers) }
	});
	await failure.catch((error) => expect(error.response.headers.get('Retry-After')).toBe('3'));
});
it.each([{ error: 'failure' }, {}, { data: null }, [], null])(
	'refuses the invalid proxy envelope %j',
	async (body) => {
		const reader = createArc72Reader(
			vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body)))
		);
		await expect(reader.readArc72Page(query, new AbortController().signal)).rejects.toThrow(
			SyntaxError
		);
	}
);
it.each([
	{ ...query, maxRound: 9007199254740992n },
	{ ...query, minRound: 0n },
	{ ...query, maxRound: 1000002n },
	{ ...query, minRound: 101n }
])('refuses an unsafe or oversize window before fetching %#', async (bad) => {
	const fetcher = vi.fn<typeof fetch>();
	await expect(
		createArc72Reader(fetcher).readArc72Page(bad, new AbortController().signal)
	).rejects.toThrow();
	expect(fetcher).not.toHaveBeenCalled();
});
it('propagates caller abort before and while reading the body', async () => {
	const aborted = new AbortController();
	aborted.abort();
	const idle = vi.fn<typeof fetch>();
	await expect(createArc72Reader(idle).readArc72Page(query, aborted.signal)).rejects.toThrow();
	expect(idle).not.toHaveBeenCalled();
	const controller = new AbortController();
	const fetcher = vi.fn<typeof fetch>().mockImplementation(
		async (_url, init) =>
			({
				ok: true,
				json: async () => {
					controller.abort();
					init?.signal?.throwIfAborted();
				}
			}) as Response
	);
	await expect(
		createArc72Reader(fetcher).readArc72Page(query, controller.signal)
	).rejects.toThrow();
});
