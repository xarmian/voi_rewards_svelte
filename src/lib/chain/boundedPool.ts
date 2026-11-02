export async function runBounded<T>(
	items: readonly T[],
	limit: number,
	task: (item: T) => Promise<void>
): Promise<void> {
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const item = items[next++];
			try {
				await task(item);
			} catch {
				// A failed item must not prevent the remaining items from running.
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, limit)) }, worker));
}
