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

	function get(
		key: K,
		fetcher: () => Promise<V>,
		options: { force?: boolean; strict: true }
	): Promise<NonNullable<V>>;
	function get(
		key: K,
		fetcher: () => Promise<V>,
		options?: { force?: boolean; strict?: boolean }
	): Promise<V>;
	function get(
		key: K,
		fetcher: () => Promise<V>,
		{ force = false, strict = false } = {}
	): Promise<V> {
		let entry = entries.get(key);
		// TASK-30: ordinary callers join the newest request, even if a stored value is fresh.
		if (!strict && !force && entry?.inFlight) return entry.inFlight;
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
		// Strict reads start their own request so stale fallback cannot mask a failure.
		const request = Promise.resolve()
			.then(fetcher)
			.then(
				(value) => {
					if (strict && value == null) throw new Error('Account not found');
					// TASK-30: failed refetches retain the previous value and its original timestamp.
					// TASK-30 r2: never across an invalidation (a detached entry's value was discarded).
					if (value == null) return entries.get(key) === current ? (current.value ?? value) : value;
					// TASK-30: only the newest non-invalidated request may publish a value.
					if (entries.get(key) === current && current.sequence === sequence) {
						current.value = value;
						current.fetchedAt = now();
						onValue?.(key, value);
					}
					return value;
				},
				(error) => {
					if (strict) throw error;
					if (current.value != null && entries.get(key) === current) return current.value;
					throw error;
				}
			)
			.finally(() => {
				if (current.inFlight === request) delete current.inFlight;
				if (current.sequence !== sequence) return;
				if (current.value == null && entries.get(key) === current) entries.delete(key);
			});
		// Only ordinary requests may be joined: strict failures must stay with strict callers.
		if (!strict) current.inFlight = request;
		return request;
	}

	function invalidate(key?: K) {
		if (arguments.length === 0) entries.clear();
		else entries.delete(key as K);
	}

	return { get, invalidate };
}
