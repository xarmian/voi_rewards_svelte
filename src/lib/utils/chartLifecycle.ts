// TASK-31: one owner for chart resources and deferred initialization.
export function createChartLifecycle() {
	let disposed = false;
	const disposers = new Set<() => void>();

	function add(disposer: () => void) {
		let active = true;
		const release = () => {
			if (!active) return;
			active = false;
			disposers.delete(release);
			disposer();
		};
		if (disposed) release();
		else disposers.add(release);
		return release;
	}

	function deferred(fn: () => void, ms: number) {
		if (disposed) return;
		const timer = setTimeout(() => {
			cancel();
			if (!disposed) fn();
		}, ms);
		const cancel = add(() => clearTimeout(timer));
	}

	function dispose() {
		if (disposed) return;
		disposed = true;
		// TASK-31: release resources in reverse registration order.
		for (const release of [...disposers].reverse()) release();
	}

	return {
		add,
		deferred,
		dispose,
		get disposed() {
			return disposed;
		}
	};
}
