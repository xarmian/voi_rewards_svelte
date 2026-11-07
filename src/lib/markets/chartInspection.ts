export type Inspection = { index: number | null; announcement: string };
type Action = { key: string } | { pointer: number | null } | { reset: true };
export const inspectionInstructions =
	'Left/Right: step through observations. Home/End: first/last observation. Escape: clear inspection.';

export function clearInspection(): Inspection {
	return { index: null, announcement: '' };
}
export function isInspectionKey(key: string): boolean {
	return ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(key);
}
export function inspect(
	state: Inspection,
	action: Action,
	observations: readonly string[]
): Inspection {
	if ('reset' in action) return clearInspection();
	if ('pointer' in action) {
		const index = action.pointer;
		return {
			index: index !== null && index >= 0 && index < observations.length ? index : null,
			announcement: ''
		};
	}
	const { key } = action;
	if (!isInspectionKey(key)) return state;
	if (key === 'Escape' || !observations.length) return clearInspection();
	const last = observations.length - 1;
	let index = state.index;
	if (key === 'Home') index = 0;
	else if (key === 'End') index = last;
	else if (key === 'ArrowLeft') index = index === null ? last : Math.max(0, index - 1);
	else if (key === 'ArrowRight') index = index === null ? 0 : Math.min(last, index + 1);
	return { index, announcement: index === null ? '' : observations[index] };
}
