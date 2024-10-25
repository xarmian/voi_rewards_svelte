import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  const category = params.category ? params.category : 'All';

  const pageMetaTags = {
    title: 'Voi Ecosystem',
    description: 'Explore the Voi Ecosystem',
    imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png'  
  };

  if (category !== 'All') {
    pageMetaTags.title = `${category} in the Voi Ecosystem`;
    pageMetaTags.description = `Explore ${category} in the Voi Ecosystem`;
  }

  return { category, pageMetaTags };
};