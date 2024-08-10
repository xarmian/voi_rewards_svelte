// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '@supabase/auth-helpers-sveltekit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from './lib/database.types';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createSupabaseServerClient<Database>({
    supabaseUrl: PUBLIC_SUPABASE_URL,
    supabaseKey: PUBLIC_SUPABASE_ANON_KEY,
    event,
  });

  event.locals.getUser = async () => {
    const {
        data: { user },
    } = await event.locals.supabase.auth.getUser();
    return user;
  };

  const user = await event.locals.getUser();
    
    if (user) {
        event.locals.user = user;
    }

  const response = await resolve(event);
  return response;
};