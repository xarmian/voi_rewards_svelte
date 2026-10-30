export const UPSTREAM_TIMEOUT_MS = 5000;

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

/** Bound the entire operation, including response body reads. */
export async function withDeadline<T>(
	run: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number
): Promise<T> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			const reason = new DOMException('Request deadline exceeded', 'TimeoutError');
			reject(reason);
			controller.abort(reason);
		}, timeoutMs);
	});
	try {
		return await Promise.race([deadline, run(controller.signal)]);
	} finally {
		clearTimeout(timer);
	}
}
