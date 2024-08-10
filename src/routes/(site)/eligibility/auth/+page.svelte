<script lang="ts">
    import { onMount } from 'svelte';
    import { supabasePublicClient as supabase } from '$lib/supabase';
    import { goto } from '$app/navigation';
  
    let error: string | null = null;
  
    onMount(async () => {
      const { data, error: authError } = await supabase.auth.getSession();
  
      if (authError) {
        error = 'Authentication failed. Please try again.';
        return;
      }
  
      if (data.session) {
        try {
          const response = await fetch('/api/auth/discord', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              access_token: data.session.provider_token,
              user_id: data.session.user.id,
            }),
          });
  
          if (response.ok) {
            goto('/eligibility');
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
  
  <main>
    {#if error}
      <p>{error}</p>
      <a href="/eligibility">Return to Eligibility Page</a>
    {:else}
      <p>Processing your login, please wait...</p>
    {/if}
  </main>