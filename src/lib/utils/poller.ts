interface PollerOptions {
	task: () => Promise<void>;
	visibility: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}

export function createPoller({ task, visibility }: PollerOptions) {
	let enabled = false;
	let destroyed = false;
	let pendingRun = false;
	let intervalMs = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let inFlight: Promise<void> | null = null;

	function clearTimer() {
		if (timer !== null) clearTimeout(timer);
		timer = null;
	}

	function trigger() {
		// TASK-30: automatic polls keep running after failures; manual callers can await errors.
		void run(false).catch(() => undefined);
	}

	// TASK-30 r2: only a manual run is owed after a hidden tab; a hidden poll resumes via `enabled`.
	function run(manual = true): Promise<void> {
		if (destroyed) return Promise.resolve();
		if (visibility.visibilityState === 'hidden') {
			if (manual) pendingRun = true;
			return Promise.resolve();
		}
		pendingRun = false;
		if (inFlight) return inFlight;
		clearTimer();
		inFlight = Promise.resolve()
			.then(task)
			.finally(() => {
				inFlight = null;
				if (enabled && !destroyed && visibility.visibilityState !== 'hidden') {
					timer = setTimeout(trigger, intervalMs);
				}
			});
		return inFlight;
	}

	function start(ms: number) {
		if (destroyed || (enabled && intervalMs === ms)) return;
		enabled = true;
		intervalMs = ms;
		trigger();
	}

	function stop() {
		enabled = false;
		// TASK-30: a hidden one-shot run is still owed when polling stops.
		clearTimer();
	}

	function onVisibilityChange() {
		if (visibility.visibilityState === 'hidden') clearTimer();
		else if (enabled || pendingRun) trigger();
	}

	visibility.addEventListener('visibilitychange', onVisibilityChange);

	function destroy() {
		destroyed = true;
		pendingRun = false;
		stop();
		visibility.removeEventListener('visibilitychange', onVisibilityChange);
	}

	return { start, stop, run, destroy };
}
