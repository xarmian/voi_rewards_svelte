export const load = async ({ params }) => {
    const { slug } = params;

    const parts = slug.split('/');
	const wallet = parts[0]??'';
    const projectId = Number(parts[1]??0);

    const pageMetaTags = {
        title: 'Voi TestNet Phase 2 Quest Tracker',
    };

    return {
        props: {
            wallet,
            projectId,
            pageMetaTags,
        },
    };
};