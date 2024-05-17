export const load = async ({ params }) => {
    const { slug } = params;

    const parts = slug.split('/');
	const wallet = parts[0]??'';
    const project = parts[1]??'';

    const pageMetaTags = {
        title: 'Voi TestNet Phase 2 Quest Tracker',
    };

    return {
        props: {
            wallet,
            project,
            pageMetaTags,
        },
    };
};