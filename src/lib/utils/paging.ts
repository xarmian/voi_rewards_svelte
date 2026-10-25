export function clampPage(page: number, total: number, perPage: number): number {
	return Math.max(1, Math.min(page, Math.max(1, Math.ceil(total / perPage))));
}
