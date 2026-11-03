export type PollReport =
	| { status: 'checking' }
	| { status: 'unavailable'; consecutiveErrors: number; error: string };
export type PollResult<T> =
	| { status: 'done'; value: T }
	| { status: 'timeout' }
	| { status: 'aborted' };

type CheckResult<T> = { done: true; value: T } | { done: false };
type CheckOutcome<T> =
	| { status: 'returned'; result: CheckResult<T> }
	| { status: 'error'; error: string; timedOut: boolean };
type Stop = { status: 'timeout' } | { status: 'aborted' };

function pause(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal?.aborted) return resolve();
		const timer = setTimeout(finish, ms);
		signal?.addEventListener('abort', finish, { once: true });
		function finish() {
			clearTimeout(timer);
			signal?.removeEventListener('abort', finish);
			resolve();
		}
	});
}

export async function pollUntil<T>(options: {
	check(signal: AbortSignal): Promise<CheckResult<T>>;
	intervalMs: number;
	checkTimeoutMs: number;
	deadlineMs: number;
	signal?: AbortSignal;
	onReport?(report: PollReport): void;
	now?(): number;
	sleep?(ms: number, signal?: AbortSignal): Promise<void>;
	unavailableAfter?: number;
}): Promise<PollResult<T>> {
	const { check, intervalMs, checkTimeoutMs, deadlineMs, signal, onReport } = options;
	const now = options.now ?? Date.now;
	const sleep = options.sleep ?? pause;
	const start = now();
	if (signal?.aborted) return { status: 'aborted' };
	if (deadlineMs <= 0) return { status: 'timeout' };
	const lifetime = new AbortController();
	let stop: Stop | undefined;
	let finish!: (result: Stop) => void;
	const stopped = new Promise<Stop>((resolve) => {
		finish = (result) => {
			if (stop) return;
			stop = result;
			resolve(result);
			lifetime.abort();
		};
	});
	const abort = () => finish({ status: 'aborted' });
	signal?.addEventListener('abort', abort, { once: true });
	const deadlineTimer = setTimeout(() => finish({ status: 'timeout' }), deadlineMs);
	let consecutiveErrors = 0;
	try {
		while (!stop) {
			if (now() - start >= deadlineMs) return { status: 'timeout' };
			const controller = new AbortController();
			const abortCheck = () => controller.abort();
			lifetime.signal.addEventListener('abort', abortCheck, { once: true });
			// Handle both synchronous throws and rejected promises, including late rejections.
			const settled = Promise.resolve()
				.then(() => check(controller.signal))
				.then<CheckOutcome<T>, CheckOutcome<T>>(
					(result) => ({ status: 'returned', result }),
					(error: unknown) => ({
						status: 'error',
						error: error instanceof Error ? error.message : String(error),
						timedOut: false
					})
				);
			let checkTimer: ReturnType<typeof setTimeout> | undefined;
			const timedOut = new Promise<CheckOutcome<T>>((resolve) => {
				checkTimer = setTimeout(() => {
					resolve({
						status: 'error',
						error: `timed out after ${checkTimeoutMs / 1000}s`,
						timedOut: true
					});
					controller.abort();
				}, checkTimeoutMs);
			});
			let outcome: CheckOutcome<T> | Stop;
			try {
				outcome = await Promise.race([settled, timedOut, stopped]);
			} finally {
				clearTimeout(checkTimer);
				lifetime.signal.removeEventListener('abort', abortCheck);
			}
			if (outcome.status === 'aborted' || outcome.status === 'timeout') return outcome;
			consecutiveErrors = outcome.status === 'returned' ? 0 : consecutiveErrors + 1;
			try {
				onReport?.(
					outcome.status === 'error' && consecutiveErrors >= (options.unavailableAfter ?? 2)
						? { status: 'unavailable', consecutiveErrors, error: outcome.error }
						: { status: 'checking' }
				);
			} catch {
				// A detached view must not interrupt polling.
			}
			if (signal?.aborted) return { status: 'aborted' };
			if (outcome.status === 'returned' && outcome.result.done)
				return { status: 'done', value: outcome.result.value };
			if (now() - start >= deadlineMs) return { status: 'timeout' };
			if (outcome.status === 'error' && outcome.timedOut) {
				// Aborting is cooperative: never overlap a check that ignores its signal.
				const waiting = await Promise.race([settled.then(() => undefined), stopped]);
				if (waiting) return waiting;
			}
			const remaining = deadlineMs - (now() - start);
			if (remaining <= 0) return { status: 'timeout' };
			await Promise.race([sleep(Math.min(intervalMs, remaining), lifetime.signal), stopped]);
		}
		return stop;
	} finally {
		clearTimeout(deadlineTimer);
		signal?.removeEventListener('abort', abort);
		lifetime.abort();
	}
}
