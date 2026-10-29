import type { Reroute } from '@sveltejs/kit';

export const reroute: Reroute = ({ url }) => {
	if (url.hostname === 'quests.voirewards.com' && url.pathname === '/') return '/quests';
};
