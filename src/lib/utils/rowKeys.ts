/**
 * Keys for a keyed {#each} over external rows, unique even when the data repeats.
 *
 * Svelte >=5.50 throws `each_key_duplicate` in production on a repeated key, which takes the
 * whole list down. Use this wherever the key comes from data the code doesn't control (an API,
 * an indexer, a JSON file) and isn't unique by construction; the population is on the TASK-38
 * trail. The first occurrence of a key keeps it; a repeat gets the first free `#2`, `#3`, ...
 * so keys stay stable for duplicate-free data.
 */
export function rowKeys<T>(rows: readonly T[] | null | undefined, key: (row: T) => string): string[] {
	const used = new Set<string>();
	return (rows ?? []).map((row) => {
		const base = key(row);
		let k = base;
		for (let n = 2; used.has(k); n++) k = `${base}#${n}`;
		used.add(k);
		return k;
	});
}
