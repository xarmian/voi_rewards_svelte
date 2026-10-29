export type SearchResult<T> = { status: 'success'; data: T } | { status: 'error'; error: unknown };

/** Debounce queries and invalidate in-flight work immediately on search or cancel. */
export function createLatestSearch<T>(
	fetcher: (query: string) => Promise<T>,
	{ delay = 150, onResult }: { delay?: number; onResult: (result: SearchResult<T>) => void }
) {
	let sequence = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;

	function cancel() {
		clearTimeout(timer);
		sequence++;
	}

	function search(query: string) {
		cancel();
		const request = sequence;
		timer = setTimeout(async () => {
			let result: SearchResult<T>;
			try {
				result = { status: 'success', data: await fetcher(query) };
			} catch (error) {
				result = { status: 'error', error };
			}
			if (request !== sequence) return;
			onResult(result);
		}, delay);
	}

	return { search, cancel };
}
