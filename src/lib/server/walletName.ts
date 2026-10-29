import { isValidAddress } from 'algosdk';

export type WalletNameResult =
	| { kind: 'address'; address: string }
	| { kind: 'not-found' }
	| { kind: 'unavailable' };

type Attempt = { result: WalletNameResult; retryable: boolean };

// One deadline per attempt covers the headers AND the body (TASK-79: a stalled body was unbounded).
// Two attempts plus the jitter stay under ~6 s (ruling on TASK-79).
const ATTEMPT_TIMEOUT_MS = 2500;
const jitterMs = () => 100 + Math.random() * 300;

async function attempt(url: string, fetchFn: typeof fetch, timeoutMs: number): Promise<Attempt> {
	const deadline = new AbortController();
	const timer = setTimeout(
		() => deadline.abort(new DOMException('enVoi lookup deadline exceeded', 'TimeoutError')),
		timeoutMs
	);
	// Bounds the wait even when a fetch implementation ignores the signal.
	const aborted = new Promise<never>((_, reject) => {
		deadline.signal.addEventListener('abort', () => reject(deadline.signal.reason), { once: true });
	});
	aborted.catch(() => {});
	try {
		const response = await Promise.race([aborted, fetchFn(url, { signal: deadline.signal })]);
		if (response.status !== 200) {
			return { result: { kind: 'unavailable' }, retryable: response.status >= 500 };
		}
		const body = await Promise.race([aborted, response.json()]);
		if (!Array.isArray(body?.results)) return { result: { kind: 'unavailable' }, retryable: false };
		const first = body.results[0];
		if (first === undefined || first?.address === null) {
			return { result: { kind: 'not-found' }, retryable: false };
		}
		const address = first?.address;
		if (typeof address === 'string' && isValidAddress(address)) {
			return { result: { kind: 'address', address }, retryable: false };
		}
		return { result: { kind: 'unavailable' }, retryable: false };
	} catch (error) {
		// A timeout or a network failure is retryable; a body that is not JSON is not.
		return { result: { kind: 'unavailable' }, retryable: !(error instanceof SyntaxError) };
	} finally {
		clearTimeout(timer);
	}
}

export async function resolveWalletName(
	name: string,
	fetchFn: typeof fetch,
	{
		timeoutMs = ATTEMPT_TIMEOUT_MS,
		retryDelayMs = jitterMs
	}: { timeoutMs?: number; retryDelayMs?: () => number } = {}
): Promise<WalletNameResult> {
	const url = `https://api.envoi.sh/api/address/${encodeURIComponent(name.toLowerCase())}`;
	const first = await attempt(url, fetchFn, timeoutMs);
	if (!first.retryable) return first.result;
	await new Promise((resolve) => setTimeout(resolve, retryDelayMs()));
	return (await attempt(url, fetchFn, timeoutMs)).result;
}
