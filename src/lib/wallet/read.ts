export type Source<T> = (
	| { state: 'loading' | 'error'; value?: undefined; asOf?: undefined }
	| { state: 'ready' | 'empty' | 'stale'; value: T; asOf: number }
) & { error?: string };

export async function boundedRead<T>(request: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			request,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error('Request timed out after 15 seconds')), 15000);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}

/** One browser-owned source; old addresses and retries cannot publish late results. */
export function createReadSource<T>(
	read: (address: string, force: boolean) => Promise<T>,
	publish: (result: Source<T>) => void
) {
	let generation = 0;
	let address = '';
	let last: { value: T; asOf: number } | undefined;
	return {
		async load(requested: string, force = false) {
			const requestGeneration = ++generation;
			if (requested !== address) last = undefined;
			address = requested;
			publish(last ? { state: 'stale', ...last } : { state: 'loading' });
			try {
				const value = await boundedRead(read(requested, force));
				if (requestGeneration !== generation) return;
				last = { value, asOf: Date.now() };
				publish({ state: Array.isArray(value) && value.length === 0 ? 'empty' : 'ready', ...last });
			} catch (cause) {
				if (requestGeneration !== generation) return;
				const error = cause instanceof Error ? cause.message : String(cause);
				publish(last ? { state: 'stale', ...last, error } : { state: 'error', error });
			}
		},
		dispose() {
			generation++;
		}
	};
}
