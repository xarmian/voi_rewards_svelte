import { expect, it, vi } from 'vitest';
import { PostgrestClient } from '@supabase/postgrest-js';

it('installed postgrest resolves an aborted fetch as { error }, without throwOnError', async () => {
	const controller = new AbortController();
	const fetcher = vi.fn<typeof fetch>(
		(_, init) =>
			new Promise((_, reject) => {
				const signal = init?.signal;
				if (signal?.aborted) reject(signal.reason);
				else signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
			})
	);
	const client = new PostgrestClient('https://example.invalid', { fetch: fetcher });
	const pending = Promise.resolve(
		client.from('pool_catalog').select('*').abortSignal(controller.signal)
	);
	await Promise.resolve();
	controller.abort(new DOMException('Timed out', 'TimeoutError'));
	expect(await pending).toMatchObject({
		data: null,
		status: 0,
		error: { message: expect.stringContaining('Timed out') }
	});
	expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
});
