import projects from '../../phase2/[...slug]/projects';

export const load = async ({ params }) => {
    const { projectId } = params;
    let project;

    if (projectId) {
        project = projects.find((p) => p.title === projectId);
        if (!project) {
            return {
                status: 404,
                error: new Error('Project not found'),
            };
        }
    }

    const pageMetaTags = {
        title: 'Voi Testnet Quests' + (project?.title ? ` | ${project.title}` : ''),
        description: project?.description || 'Get Your Quest On, with the Voi Testnet Network',
        imageUrl: project?.logo ? ('https://voirewards.com' + project?.logo) : 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png',
    };

    return {
        props: {
            projectId: project?.id,
        },
        pageMetaTags,
    };
};