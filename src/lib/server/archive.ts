// Phase 1/2 are a read-only archive (DOC-13, TASK-16).
export const ARCHIVED_MESSAGE =
	'Phase 1 and Phase 2 are a read-only archive. This action is no longer available.';

export function archivedResponse(): Response {
	return new Response(JSON.stringify({ error: ARCHIVED_MESSAGE }), {
		status: 410,
		headers: { 'content-type': 'application/json' }
	});
}
