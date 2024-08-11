import type { MetaTagsProps } from 'svelte-meta-tags';
import type { LayoutLoad } from './$types'
import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const load: LayoutLoad = async ({ url, data, fetch, depends }) => {
  const baseMetaTags = Object.freeze({
    title: 'Normal',
    titleTemplate: '%s | Voi Rewards Auditor',
    description: 'View real-time expected token rewards for block proposals and node health. Voi, the blockchain for You All.',
    canonical: new URL(url.pathname, url.origin).href,
    openGraph: {
      type: 'website',
      url: new URL(url.pathname, url.origin).href,
      locale: 'en_IE',
      title: 'Voi Rewards Auditor',
      description: 'View real-time expected token rewards for block proposals and node health. Voi, the blockchain for You All.',
      siteName: 'VoiRewards',
      images: [
        {
            url: 'https://voirewards.com/android-chrome-192x192.png',
            alt: 'Voi Rewards Icon',
            width: 192,
            height: 192,
            secureUrl: 'https://voirewards.com/android-chrome-192x192.png',
            type: 'image/png'
          },
          {
            url: 'https://voirewards.com/android-chrome-512x512.png',
            alt: 'Voi Rewards Icon',
            width: 512,
            height: 512,
            secureUrl: 'https://voirewards.com/android-chrome-512x512.png',
            type: 'image/png'
          }
        ],
    }
  }) satisfies MetaTagsProps;

  depends('supabase:auth')

  const supabase = isBrowser()
    ? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
        global: {
          fetch,
        },
      })
    : createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
        global: {
          fetch,
        },
        cookies: {
          getAll() {
            return data?.cookies
          },
        },
      })

  /**
   * It's fine to use `getSession` here, because on the client, `getSession` is
   * safe, and on the server, it reads `session` from the `LayoutData`, which
   * safely checked the session using `safeGetSession`.
   */
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return {
    baseMetaTags,
    url,
    session,
    supabase,
  };
};