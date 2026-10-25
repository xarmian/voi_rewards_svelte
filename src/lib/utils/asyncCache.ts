interface CacheOptions<K, V> {
	ttlMs: number;
	now?: () => number;
	onValue?: (key: K, value: NonNullable<V>) => void;
}

export function createKeyedCache<K, V>({
	ttlMs,
	now = () => Date.now(),
	onValue
}: CacheOptions<K, V>) {
	interface Entry {
		value?: V;
		fetchedAt?: number;
		inFlight?: Promise<V>;
		sequence: number;
	}
	const entries = new Map<K, Entry>();

	function get(key: K, fetcher: () => Promise<V>, { force = false } = {}): Promise<V> {
		let entry = entries.get(key);
		// TASK-30: ordinary callers join the newest request, even if a stored value is fresh.
		if (!force && entry?.inFlight) return entry.inFlight;
		if (
			!force &&
			entry?.value != null &&
			entry.fetchedAt !== undefined &&
			now() - entry.fetchedAt < ttlMs
		) {
			return Promise.resolve(entry.value);
		}
		if (!entry) {
			entry = { sequence: 0 };
			entries.set(key, entry);
		}
		const current = entry;
		const sequence = ++current.sequence;
		current.inFlight = Promise.resolve()
			.then(fetcher)
			.then(
				(value) => {
					// TASK-30: failed refetches retain the previous value and its original timestamp.
					if (value == null) return current.value ?? value;
					// TASK-30: only the newest non-invalidated request may publish a value.
					if (entries.get(key) === current && current.sequence === sequence) {
						current.value = value;
						current.fetchedAt = now();
						onValue?.(key, value);
					}
					return value;
				},
				(error) => {
					if (current.value != null) return current.value;
					throw error;
				}
			)
			.finally(() => {
				if (current.sequence !== sequence) return;
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
