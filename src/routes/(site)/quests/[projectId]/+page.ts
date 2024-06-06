export const load = async ({ params }) => {
    const { projectId } = params;

    const pageMetaTags = {
        title: 'Voi TestNet Phase 2 Quest Tracker',
    };

    return {
        props: {
            projectId,
            pageMetaTags,
        },
    };
};