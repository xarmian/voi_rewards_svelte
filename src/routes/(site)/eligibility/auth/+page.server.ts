import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { supabasePrivateClient as supabase } from '$lib/supabase-server';
import { supabasePublicClient } from '$lib/supabase-server';

export const load: PageServerLoad = async ({ params, cookies, url, locals }) => {
    console.log('cookies', cookies.getAll());
    const { data: { session } } = await supabasePublicClient.auth.getSession();
    console.log('session', session);
    
    //supabase.auth.setSession(cookies['supabase.auth.token']);
    return {
        server_data: { user: null },
    }
}