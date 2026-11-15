import { expect, it, vi } from 'vitest';
import { createArc200Reader } from './arc200Export';
import { normalizeArc200Page, normalizeArc200Metadata } from '../wallet/arc200Export';

it('uses same-origin uncached bounded history and fixed metadata queries with caller cancellation', async () => {
	const fetcher = vi
		.fn<typeof fetch>()
		.mockResolvedValue(new Response(JSON.stringify({ data: [] })));
	const reader = createArc200Reader(fetcher);
	const signal = new AbortController().signal;
	expect(
		await reader.readArc200Page({ address: 'A', minRound: 1n, maxRound: 100n }, signal)
	).toEqual([]);
	expect(fetcher).toHaveBeenLastCalledWith(
		'/api/mimir?action=get_arc200_transfers&p_user=A&p_limit=100&p_offset=0&p_min_round=1&p_max_round=100',
		{ signal, cache: 'no-store' }
	);
	fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ data: { tokens: [] } })));
	expect(await reader.readArc200Metadata(5n, signal)).toEqual({ tokens: [] });
	expect(fetcher).toHaveBeenLastCalledWith(
		'/api/mimir?action=get_arc200_tokens&contractId=5&limit=1&next-token=0',
		{ signal, cache: 'no-store' }
	);
});
it('preserves HTTP status and headers for scheduler backoff', async () => {
	const headers = new Headers({ 'Retry-After': '3' });
	const reader = createArc200Reader(
		vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429, headers }))
	);
	const failure = reader.readArc200Metadata(1n, new AbortController().signal);
	await expect(failure).rejects.toMatchObject({
		response: { status: 429, headers: expect.any(Headers) }
	});
	await failure.catch((error) => expect(error.response.headers.get('Retry-After')).toBe('3'));
});
it.each([{ error: 'failure' }, {}, { data: null }])(
	'rejects invalid proxy envelope %j',
	async (body) => {
		const reader = createArc200Reader(
			vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body)))
		);
		await expect(
			reader.readArc200Page(
				{ address: 'A', minRound: 1n, maxRound: 100n },
				new AbortController().signal
			)
		).rejects.toThrow();
	}
);
it('refuses unsafe query bounds before fetching and unsafe JSON numbers after reading', async () => {
	const fetcher = vi.fn<typeof fetch>();
	const reader = createArc200Reader(fetcher);
	const signal = new AbortController().signal;
	await expect(
		reader.readArc200Page({ address: 'A', minRound: 1n, maxRound: 9007199254740992n }, signal)
	).rejects.toThrow();
	await expect(reader.readArc200Metadata(9007199254740992n, signal)).rejects.toThrow();
	expect(fetcher).not.toHaveBeenCalled();
	fetcher.mockResolvedValueOnce(new Response('{"data":[{"round":9007199254740993}]}'));
	const data = await reader.readArc200Page({ address: 'A', minRound: 1n, maxRound: 100n }, signal);
	expect(() =>
		normalizeArc200Page(data, { address: 'A', minRound: 1n, maxRound: 100n }, () => true)
	).toThrow();
	expect(() =>
		normalizeArc200Metadata(
			JSON.parse('{"tokens":[{"contractId":9007199254740993}]}'),
			9007199254740993n
		)
	).toThrow();
});
it('propagates caller abort while reading the body', async () => {
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
		createArc200Reader(fetcher).readArc200Metadata(1n, controller.signal)
	).rejects.toThrow();
});
