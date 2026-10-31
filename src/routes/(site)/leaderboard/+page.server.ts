import { supabasePublicClient } from '$lib/supabase';
import type { VRPhase2 } from '$lib/supabase';
import type { PageServerLoad } from './$types';
import { UPSTREAM_TIMEOUT_MS } from '$lib/server/fetchWithTimeout';

export const load = (async () => {
	const [{ data, error }, { count, error: countError }] = await Promise.all([
		supabasePublicClient
			.from('vr_phase2')
			.select('*')
			.order('total_quest_points', { ascending: false })
			.limit(50)
			.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)),
		supabasePublicClient
			.from('vr_phase2')
			.select('count', { count: 'exact' })
			.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
	]);

	if (error || countError) {
		console.error(error, countError);
		return {
			status: 500,
			error: 'Failed to fetch leaderboard data'
		};
	}

	const pageMetaTags = {
		title: 'Voi TestNet Phase 2 Leaderboard',
		description: 'Get Your Quest On, with the Voi Testnet Network',
		imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png'
	};

	return {
		ranks: data as VRPhase2[],
		total_accounts: count,
		pageMetaTags
	};
}) satisfies PageServerLoad;
