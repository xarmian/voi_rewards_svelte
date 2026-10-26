export function ariaSortFor(activeKey: string, columnKey: string, dir: 'asc' | 'desc') {
	return activeKey === columnKey ? (dir === 'asc' ? 'ascending' : 'descending') : undefined;
}

export function leavesWidget(container: { contains(n: unknown): boolean }, related: unknown) {
	return related == null || !container.contains(related);
}

// -1 means focus returns to the input. Navigation stops at the last option.
export function nextOptionIndex(current: number, count: number, key: string) {
	if (count === 0) return -1;
	switch (key) {
		case 'ArrowDown':
			return Math.min(current + 1, count - 1);
		case 'ArrowUp':
			return Math.max(current - 1, -1);
		case 'Home':
			return 0;
		case 'End':
			return count - 1;
		default:
			return current;
	}
}
