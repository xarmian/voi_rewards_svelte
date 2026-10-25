import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';
import { json } from '@sveltejs/kit';
import { validateMimirParams } from '$lib/server/validate';
import type { RequestEvent } from './$types';

const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);

export async function GET({ url }: RequestEvent) {
	try {
		const validation = validateMimirParams(url.searchParams);
		if ('error' in validation) {
			return json({ error: validation.error }, { status: 400 });
		}
		const { action, params } = validation;

		const { data, error } = await supabaseMimirClient.rpc(action, params);

		if (error) {
			console.error('Error:', error);
			return json({ error: error.message }, { status: 500 });
		}

		return json({ data });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to fetch data';
		return json({ error: message }, { status: 500 });
	}
}
