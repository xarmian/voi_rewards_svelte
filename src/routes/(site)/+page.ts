export const load = (async ({ url }) => {

  if (url.hostname === 'quests.voirewards.com') {
      const pageMetaTags = {
        title: 'Voi Testnet Quests',
        description: 'Get Your Quest On, with the Voi Testnet Network',
        imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png',
      };
      return {
        pageMetaTags,
    	};

    }

});
