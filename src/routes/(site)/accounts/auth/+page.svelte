<script lang="ts">
    import { onMount } from 'svelte';
    // import { supabasePublicClient as supabase } from '$lib/supabase-server';
    import { goto } from '$app/navigation';
    import type { PageData } from '../$types';
  
    export let data: PageData;
    let error: string | null = null;
  
    onMount(async () => {
      const { data: { session }, error: authError } = await data.supabase.auth.getSession();

      console.log('getSession data', session);
  
      if (authError) {
        error = 'Authentication failed. Please try again.';
        return;
      }
  
      if (session) {
        try {
          const response = await fetch('/api/auth/discord', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              access_token: session.provider_token,
              user_id: session.user.id,
              session: session,
            }),
          });
  
          if (response.ok) {
            goto('/accounts');
          } else {
            error = 'Failed to log Discord information. Please try again.';
          }
        } catch (err) {
          error = 'An error occurred. Please try again.';
        }
      } else {
        error = 'No active session found. Please log in again.';
      }
    });
  </script>
  
  <div class="flex flex-col place-items-center py-10 text-2xl bg-white dark:bg-black">
    {#if error}
      <p>{error}</p>
      <a href="/accounts">Return to Account Management Page</a>
    {:else}
      <p>Processing your login, please wait...</p>
    {/if}
  </div>