import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  const category = params.category ? params.category : 'All';

  const pageMetaTags = {
    title: 'Voi Directory',
    description: 'Explore the Voi Ecosystem',
  };

  if (category !== 'All') {
    pageMetaTags.title = `${category} in the Voi Ecosystem`;
    pageMetaTags.description = `Explore ${category} in the Voi Ecosystem`;
  }

  return { category, pageMetaTags };
};