export function clampPage(page: number, total: number, perPage: number): number {
	// A cleared number input binds null; parseInt of junk is NaN (TASK-23 r1).
	const p = Number.isFinite(page) ? page : 1;
	return Math.max(1, Math.min(p, Math.max(1, Math.ceil(total / perPage))));
}
