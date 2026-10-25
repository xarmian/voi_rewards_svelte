interface CacheOptions {
	ttlMs: number;
	now?: () => number;
}

export function createKeyedCache<K, V>({ ttlMs, now = () => Date.now() }: CacheOptions) {
	interface Entry {
		value?: V;
		fetchedAt?: number;
		inFlight?: Promise<V>;
	}
	const entries = new Map<K, Entry>();

	function get(key: K, fetcher: () => Promise<V>, { force = false } = {}): Promise<V> {
		let entry = entries.get(key);
		if (
			!force &&
			entry?.value != null &&
			entry.fetchedAt !== undefined &&
			now() - entry.fetchedAt < ttlMs
		) {
			return Promise.resolve(entry.value);
		}
		if (entry?.inFlight) return entry.inFlight;
		if (!entry) {
			entry = {};
			entries.set(key, entry);
		}
		const current = entry;
		current.inFlight = Promise.resolve()
			.then(fetcher)
			.then((value) => {
				// TASK-30: invalidation detaches this entry, including pending results.
				if (value != null && entries.get(key) === current) {
					current.value = value;
					current.fetchedAt = now();
				}
				return value;
			})
			.finally(() => {
				delete current.inFlight;
				if (current.value == null && entries.get(key) === current) entries.delete(key);
			});
		return current.inFlight;
	}

	function invalidate(key?: K) {
		if (arguments.length === 0) entries.clear();
		else entries.delete(key as K);
	}

	return { get, invalidate };
}
