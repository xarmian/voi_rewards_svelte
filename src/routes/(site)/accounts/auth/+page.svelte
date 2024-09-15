<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';
    import type { PageData } from '../$types';
    import { PUBLIC_RECAPTCHA_SITE_KEY } from '$env/static/public';
    import { get } from 'svelte/store';
    import { page } from '$app/stores'; // Import page store to access query parameters

    export let data: PageData;
    let error: string | null = null;

    // Capture error from query parameters
    $: {
        const query = get(page).url.searchParams;
        error = query.get('error_description') || null; // Get error from URL
    }

    let recaptchaLoaded = false;
    let grecaptcha: any;
    let session: any;

    onDestroy(() => {
      if (typeof window !== 'undefined') {
        window.handleDiscordLogin = null;
      }
    });

    onMount(async () => {
      if (typeof window !== 'undefined') {
        window.handleDiscordLogin = handleDiscordLogin;
      }

      const { data: { session }, error: authError } = await data.supabase.auth.getSession();

      if (authError) {
        error = 'Authentication failed. Please try again.';
        return;
      }
 
      if (session) {
        if (!document.getElementById('recaptcha-script')) {
            const script = document.createElement('script');
            script.id = 'recaptcha-script';
            script.src = `https://www.google.com/recaptcha/api.js?render=explicit&onload=onRecaptchaLoad`;
            script.async = true;
            script.defer = true;
            script.onload = () => {
                recaptchaLoaded = true;
                console.log('reCAPTCHA script loaded');
                grecaptcha = (window as any).grecaptcha;
            };
            script.onerror = (error) => {
                console.error('Error loading reCAPTCHA script:', error);
            };
            document.head.appendChild(script);
        } else {
            console.log('reCAPTCHA script already loaded');
            recaptchaLoaded = true;
            grecaptcha = (window as any).grecaptcha;
            grecaptcha.render('g-recaptcha');
        }
      } else {
        if (!error) error = 'No active session found. Please log in again.';
      }
    });

    const handleDiscordLogin = async () => {
      const { data: { session }, error: authError } = await data.supabase.auth.getSession();

      if (authError) {
        error = 'Authentication failed. Please try again.';
        return;
      }

      if (session) {
          try {
              const token = grecaptcha.getResponse();

              if (token === '') {
                alert('Please complete the reCAPTCHA first.');
                return;
              }

              const response = await fetch('/api/auth/discord', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  access_token: session.provider_token,
                  recaptcha_token: token,
                  user_id: session.user.id,
                  session: session,
                }),
              });
      
              if (response.ok) {
                goto('/accounts');
              } else {
                // Redirect with error message
                goto(`/accounts/auth?error=Failed to log Discord information. Please try again.`);
              }
          } catch (err) {
              error = 'An error occurred. Please try again.';
          }
        }
      }
  </script>
  
  <div class="flex flex-col place-items-center py-10 text-2xl bg-white dark:bg-black">
    {#if error}
      <p>ERROR: {error}</p>
      <a href="/accounts" class="text-blue-500 underline hover:text-blue-600">Return to Account Management Page</a>
    {:else}
      <p>Processing your login, please complete the reCAPTCHA...</p>
      <div id="g-recaptcha" class="g-recaptcha" data-sitekey={PUBLIC_RECAPTCHA_SITE_KEY} data-callback="handleDiscordLogin"></div>
    {/if}
  </div>