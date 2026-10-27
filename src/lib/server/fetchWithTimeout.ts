/** Bound the caller's wait even when a fetch implementation ignores cancellation. */
export async function fetchWithTimeout(
	input: RequestInfo | URL,
	init: RequestInit & { timeoutMs: number; fetch?: typeof fetch }
): Promise<Response> {
	const { timeoutMs, fetch: fetcher = globalThis.fetch, signal: caller, ...options } = init;
	const deadline = new AbortController();
	const signal = AbortSignal.any(caller ? [caller, deadline.signal] : [deadline.signal]);
	const timer = setTimeout(
		() => deadline.abort(new DOMException('Request deadline exceeded', 'TimeoutError')),
		timeoutMs
	);
	let onAbort: () => void = () => {};
	try {
		signal.throwIfAborted();
		const aborted = new Promise<never>((_, reject) => {
			onAbort = () => reject(signal.reason);
			signal.addEventListener('abort', onAbort, { once: true });
		});
		return await Promise.race([aborted, fetcher(input, { ...options, signal })]);
	} finally {
		clearTimeout(timer);
		signal.removeEventListener('abort', onAbort);
	}
}
