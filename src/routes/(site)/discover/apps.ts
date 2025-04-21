export interface AppInfo {
  id: string;
  name: string;
  description: string;
  logoPath: string;
  url: string;
  category?: string;
  featured?: boolean;
  invert_logo_dark?: boolean;
  invert_logo_light?: boolean;
}

export const apps: AppInfo[] = [
  {
    id: 'voirewards',
    name: 'Voi Rewards Auditor',
    description: 'Track & verify your rewards',
    logoPath: '/android-chrome-192x192.png',
    url: 'https://voirewards.com',
    category: 'utility',
    featured: true
  },
  {
    id: 'humbleswap',
    name: 'HumbleSwap',
    description: 'DEX',
    logoPath: '/logos/humble.png',
    url: 'https://voi.humble.sh',
    category: 'defi',
    featured: true
  },
  {
    id: 'nomadex',
    name: 'Nomadex',
    description: 'DEX',
    logoPath: '/logos/nomadex.png',
    url: 'https://voi.nomadex.app',
    category: 'defi',
    featured: true
  },
  {
    id: 'highforge',
    name: 'Highforge',
    description: 'NFT Mint & Shuffle',
    logoPath: '/logos/highforge.png',
    url: 'https://highforge.io',
    category: 'nft',
    featured: true,
    invert_logo_dark: true,
  },
  {
    id: 'nftnavigator',
    name: 'NFT Navigator',
    description: 'NFT Explorer',
    logoPath: '/logos/nftnavigator.png',
    url: 'https://nftnavigator.xyz',
    category: 'nft',
    featured: true,
    invert_logo_dark: true,
  },
  {
    id: 'nautilus',
    name: 'Nautilus',
    description: 'NFT Marketplace',
    logoPath: '/logos/nautilus.png',
    url: 'https://nautilus.sh',
    category: 'nft',
    featured: true
  },
  {
    id: 'envoi',
    name: 'enVoi',
    description: 'Naming Service',
    logoPath: '/logos/envoi.png',
    url: 'https://envoi.sh',
    category: 'utility',
    featured: true
  },
  {
    id: 'func',
    name: 'FUNC',
    description: 'Node Running Application',
    logoPath: '/logos/func.png',
    url: 'https://github.com/GalaxyPay/func',
    category: 'utility',
    featured: true
  },
  {
    id: 'communitychest',
    name: 'Community Chest',
    description: 'No Loss Lottery',
    logoPath: '/logos/communitychest.svg',
    url: 'https://nautilus.sh/#/community-chest?contract=664258',
    category: 'defi',
    featured: true
  },
  {
    id: 'pixels',
    name: 'Pixels',
    description: 'Pixels Galaxy',
    logoPath: '/logos/pixels.jpeg',
    url: 'https://pixelsgalaxy.space/',
    category: 'nft',
    featured: true
  }
];

// Helper function to get apps by category
export const getAppsByCategory = (category?: string) => {
  if (!category) return apps;
  return apps.filter(app => app.category === category);
};

// Helper function to get featured apps
export const getFeaturedApps = () => {
  return apps.filter(app => app.featured);
}; 