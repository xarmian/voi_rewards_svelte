import type { MetaTagsProps } from 'svelte-meta-tags';

export const load = async ({ url }) => {
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

  return {
    baseMetaTags,
    url
  };
};