import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';
import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';

const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);

// Define allowed RPC functions to prevent arbitrary function calls
const ALLOWED_ACTIONS = [
    'get_online_account_count',
    'get_arc200_transfers',
] as const;

type AllowedAction = typeof ALLOWED_ACTIONS[number];

// Validate if the action is allowed
function isAllowedAction(action: string): action is AllowedAction {
    return ALLOWED_ACTIONS.includes(action as AllowedAction);
}

export async function GET({ url }: RequestEvent) {
    try {
        const action = url.searchParams.get('action') || 'get_online_account_count';
        
        if (!isAllowedAction(action)) {
            return json({ 
                error: `Invalid action. Allowed actions are: ${ALLOWED_ACTIONS.join(', ')}` 
            }, { status: 400 });
        }

        // Add any additional parameters from the URL
        const params: Record<string, string | number> = {};
        for (const [key, value] of url.searchParams.entries()) {
            if (key !== 'action') {
                // Convert string numbers to actual numbers if possible
                params[key] = !isNaN(Number(value)) ? Number(value) : value;
            }
        }

        console.log('Calling RPC with params:', action, params);

        const { data, error } = await supabaseMimirClient
            .rpc(action, params);

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
