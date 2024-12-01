import { json } from '@sveltejs/kit';
import { fetchProjects } from '../../(site)/phase2/[...slug]/projects';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
    try {
        const projects = await fetchProjects();
        const activeProjects = projects.filter(p => p.status === 'active');
        
        return json(activeProjects, {
            headers: {
                'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
            }
        });
    } catch (error) {
        console.error('Error fetching ecosystem projects:', error);
        return new Response('Error fetching ecosystem projects', { status: 500 });
    }
}; 