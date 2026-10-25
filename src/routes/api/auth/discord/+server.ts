import { archivedResponse } from '$lib/server/archive';

export function POST(): Response {
	return archivedResponse();
}
