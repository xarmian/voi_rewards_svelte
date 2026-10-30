/**
 * Keys for a keyed {#each} over report rows, unique even when the data repeats.
 *
 * Svelte >=5.50 throws `each_key_duplicate` in production on a repeated key, and the report
 * rows come from an external JSON file whose natural keys (recipient + date, a proposal name)
 * are not unique by construction (TASK-38 trail). The first occurrence of a key keeps it; a
 * repeat gets the first free `#2`, `#3`, ... so keys stay stable for duplicate-free data.
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
